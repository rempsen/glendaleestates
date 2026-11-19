// =====================================================================
// Pricing queue — pure rules shared by the admin page, notify-pricing-request and pricing-digest
// (Phase 2 Task 12, spec §6.5–6.6). A pricing request is a quote line with status 'pending' and flagged_to set, or a
// pending buyer change request (source 'buyer_request') not yet flagged to anyone (Task 13: shown as "Unassigned").
//
// ZERO IMPORTS, no Deno/Node/browser globals (same bytes in the browser via @shared, edge functions and bun).
// =====================================================================

/** One row of the `pricing_queue` view (migration 0006), minus the buyer email and computed age. */
export interface QueueRow {
  line_id: string;
  submission_id: string;
  unit_number: string | null;
  first_name: string | null;
  last_name: string | null;
  section: string | null;
  location: string | null;
  label: string | null;
  internal_note: string | null;
  flagged_to: string | null;
  assignee_email: string | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  flagged_at: string | null;
}

export const DEFAULT_ESCALATION_HOURS = 4;
/**
 * portal_settings key (migration 0012): profiles.user_id that request_quote_change() flags a buyer change request to
 * when no staff member has edited the unit's lines yet. Separate from SETTINGS_KEYS (the notifier's own keys).
 */
export const DEFAULT_ASSIGNEE_KEY = 'pricing_default_assignee';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The stored default assignee, or null when unset or not a uuid (same rule as the RPC). */
export function parseDefaultAssignee(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v.trim()) ? v.trim() : null;
}
/**
 * Open queue predicate, shared by the pricing_queue view (migration 0012) and the service-role digest query: pending
 * lines flagged to someone, plus buyer change requests nobody is flagged to (grouped under "Unassigned").
 */
export const OPEN_QUEUE_REST_FILTER = 'status=eq.pending&or=(flagged_to.not.is.null,source.eq.buyer_request)';
export const SETTINGS_KEYS = {
  teamsWebhookUrl: 'teams_webhook_url',
  escalationHours: 'pricing_escalation_hours',
  digestRecipients: 'pricing_digest_recipients',
} as const;

/** Hours since `iso` at `now`; null when the timestamp is missing or unparseable. */
export function hoursSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now.getTime() - t) / 3_600_000;
}

/** "1 min", "30 min", "3 h", "2 d 1 h"; "—" when unknown. */
export function formatAge(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  const h = Math.floor(hours);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  const rest = h % 24;
  return rest ? `${d} d ${rest} h` : `${d} d`;
}

/** Escalation: lines waiting strictly longer than `hours`. A line with no flagged_at is never overdue. */
export function selectOverdue<T extends Pick<QueueRow, 'flagged_at'>>(rows: T[], hours: number, now: Date): T[] {
  return rows.filter((r) => {
    const age = hoursSince(r.flagged_at, now);
    return age != null && age > hours;
  });
}

export const personName = (first: string | null | undefined, last: string | null | undefined): string =>
  [first, last].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');

export interface AssigneeGroup<T extends QueueRow = QueueRow> {
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string | null;
  /** Oldest first; lines with unknown age last. */
  rows: T[];
  oldestHours: number | null;
}

/** Digest grouping: one group per assignee, sorted by name. */
export function groupByAssignee<T extends QueueRow>(rows: T[], now: Date): AssigneeGroup<T>[] {
  const map = new Map<string, AssigneeGroup<T>>();
  for (const r of rows) {
    const id = r.flagged_to ?? '';
    let g = map.get(id);
    if (!g) {
      g = {
        assigneeId: id,
        assigneeName: personName(r.assignee_first_name, r.assignee_last_name) || r.assignee_email || 'Unassigned',
        assigneeEmail: r.assignee_email,
        rows: [],
        oldestHours: null,
      };
      map.set(id, g);
    }
    g.rows.push(r);
  }
  const age = (r: T) => hoursSince(r.flagged_at, now) ?? -Infinity;
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.rows.sort((a, b) => age(b) - age(a));
    const oldest = g.rows.length ? hoursSince(g.rows[0].flagged_at, now) : null;
    g.oldestHours = oldest;
  }
  return groups.sort((a, b) => a.assigneeName.localeCompare(b.assigneeName));
}

export type WebhookDecision =
  | { act: true; lineId: string; flaggedTo: string; flaggedAt: string | null }
  | { act: false; reason: string };

type Rec = Record<string, unknown> | null | undefined;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * Supabase Database Webhook payload `{type, table, record, old_record}` → whether to notify. Acts only when
 * `record.flagged_to` is set and differs from `old_record?.flagged_to` (INSERT or UPDATE on quote_lines).
 */
export function webhookDecision(payload: unknown): WebhookDecision {
  if (!payload || typeof payload !== 'object') return { act: false, reason: 'not a webhook payload' };
  const p = payload as { type?: unknown; table?: unknown; record?: Rec; old_record?: Rec };
  if (p.table !== 'quote_lines') return { act: false, reason: 'not quote_lines' };
  if (p.type !== 'INSERT' && p.type !== 'UPDATE') return { act: false, reason: `ignored event ${String(p.type)}` };
  const rec = p.record;
  const lineId = str(rec?.id);
  const to = str(rec?.flagged_to);
  if (!rec || !lineId) return { act: false, reason: 'no record' };
  if (!to) return { act: false, reason: 'not flagged' };
  if (rec.status === 'removed') return { act: false, reason: 'line removed' };
  if (p.type === 'UPDATE' && str(p.old_record?.flagged_to) === to) return { act: false, reason: 'flagged_to unchanged' };
  return { act: true, lineId, flaggedTo: to, flaggedAt: str(rec.flagged_at) };
}

/** Idempotency key for one flagging: a re-delivered webhook (same flagged_at) maps to the same key. */
export function notifyDedupeKey(lineId: string, flaggedTo: string, flaggedAt: string | null): string {
  return `pricing_request:${lineId}:${flaggedTo}:${flaggedAt ?? 'none'}`;
}

/** <portal>/admin/quotes/:submissionId#line-:lineId */
export function consoleLink(base: string, submissionId: string, lineId: string): string {
  return `${base.replace(/\/+$/, '')}/admin/quotes/${submissionId}#line-${lineId}`;
}

export function parseEscalationHours(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 168 ? n : DEFAULT_ESCALATION_HOURS;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseDigestRecipients(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== 'string') continue;
    const e = raw.trim();
    if (!EMAIL_RE.test(e) || out.some((x) => x.toLowerCase() === e.toLowerCase())) continue;
    out.push(e);
  }
  return out;
}

export function parseTeamsWebhookUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(s)) return null;
  return s;
}

type Embedded = { unit_number?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined;
const nul = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Service-role REST rows (`quote_lines` with `buyer:buyer_selections(...)` and `assignee:profiles!…(...)` embeds) →
 * QueueRow. Edge functions cannot use the `pricing_queue` view: it filters on is_staff(auth.uid()), which is null
 * for the service role.
 */
export function queueRowsFromRest(rows: ReadonlyArray<Record<string, unknown>>): QueueRow[] {
  return rows.map((r) => {
    const b = r.buyer as Embedded;
    const a = r.assignee as Embedded;
    return {
      line_id: String(r.id),
      submission_id: String(r.submission_id),
      unit_number: nul(b?.unit_number),
      first_name: nul(b?.first_name),
      last_name: nul(b?.last_name),
      section: nul(r.section),
      location: nul(r.location),
      label: nul(r.label),
      internal_note: nul(r.internal_note),
      flagged_to: nul(r.flagged_to),
      assignee_email: nul(a?.email),
      assignee_first_name: nul(a?.first_name),
      assignee_last_name: nul(a?.last_name),
      flagged_at: nul(r.flagged_at),
    };
  });
}
