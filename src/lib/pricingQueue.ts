// Pricing queue page model and inline answers (Phase 2 Task 12, spec §6.5). Pure: the page feeds it pricing_queue
// rows and applies answer patches through useQuoteLines.upsert (the reducer path), never a raw write.
import {
  formatAge, groupByAssignee, hoursSince, parseDigestRecipients, parseEscalationHours, parseTeamsWebhookUrl, personName,
  SETTINGS_KEYS, DEFAULT_ASSIGNEE_KEY, parseDefaultAssignee, type QueueRow,
} from '@shared/pricingQueue';
import type { QuoteLine } from '@/lib/quoteLines';
import { applyStatusChange, priceEditPatch, type EditPatch } from '@/lib/lineEdits';
import { countedHiddenRefusal } from '@/lib/quoteLinesReducer';

export interface QueueItem {
  lineId: string;
  submissionId: string;
  unit: string;
  buyer: string;
  location: string;
  label: string;
  note: string | null;
  age: string;
  overdue: boolean;
  /** In-app console deep link. */
  href: string;
}

export interface QueueGroup {
  assigneeId: string;
  assigneeName: string;
  mine: boolean;
  overdue: number;
  items: QueueItem[];
}

export interface QueueViewModel { total: number; overdue: number; groups: QueueGroup[] }

export function buildQueueViewModel(
  rows: QueueRow[],
  opts: { now: Date; escalationHours: number; me?: string | null },
): QueueViewModel {
  let overdueTotal = 0;
  const groups = groupByAssignee(rows, opts.now).map((g): QueueGroup => {
    const items = g.rows.map((r): QueueItem => {
      const hours = hoursSince(r.flagged_at, opts.now);
      const overdue = hours != null && hours > opts.escalationHours;
      return {
        lineId: r.line_id,
        submissionId: r.submission_id,
        unit: r.unit_number ? `Unit ${r.unit_number}` : 'Unit —',
        buyer: personName(r.first_name, r.last_name),
        location: r.location ?? '',
        label: r.label ?? '',
        note: r.internal_note?.trim() || null,
        age: formatAge(hours),
        overdue,
        href: `/admin/quotes/${r.submission_id}#line-${r.line_id}`,
      };
    });
    const overdue = items.filter((i) => i.overdue).length;
    overdueTotal += overdue;
    return { assigneeId: g.assigneeId, assigneeName: g.assigneeName, mine: !!opts.me && g.assigneeId === opts.me, overdue, items };
  });
  groups.sort((a, b) => Number(b.mine) - Number(a.mine));
  return { total: rows.length, overdue: overdueTotal, groups };
}

export type Answer =
  | { kind: 'price'; unitPrice?: number | null; amount?: number | null }
  | { kind: 'included' }
  | { kind: 'under_review' | 'deferred'; reason: string };

type AnswerLine = Pick<QuoteLine, 'status' | 'quantity' | 'unit_price' | 'amount' | 'pricing_mode' | 'client_note' | 'client_visible'>;
export type AnswerResult = { ok: true; patch: EditPatch } | { ok: false; reason: string };

const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Inline answer → one line patch, built only from the console's rules (priceEditPatch, applyStatusChange) and
 * checked against counted ⇒ client_visible. The caller sends it with useQuoteLines.upsert.
 */
export function answerPatch(line: AnswerLine, answer: Answer): AnswerResult {
  let patch: EditPatch = {};
  let cur = { ...line };
  const step = (r: { ok: true; patch: EditPatch } | { ok: false; reason: string }): boolean => {
    if (r.ok === false) return false;
    patch = { ...patch, ...r.patch };
    cur = { ...cur, ...r.patch };
    return true;
  };

  if (answer.kind === 'price') {
    const byUnit = num(answer.unitPrice) && num(line.quantity);
    if (byUnit) {
      const p = priceEditPatch(cur, { unit_price: answer.unitPrice as number });
      if (!step(p)) return p as AnswerResult;
      const s = applyStatusChange(cur, 'upgrade');
      if (!step(s)) return s as AnswerResult;
    } else if (num(answer.amount)) {
      const s = applyStatusChange(cur, 'upgrade');
      if (!step(s)) return s as AnswerResult;
      const p = priceEditPatch(cur, { amount: answer.amount });
      if (!step(p)) return p as AnswerResult;
    } else {
      return { ok: false, reason: num(answer.unitPrice) ? 'This line has no quantity — enter the amount.' : 'Enter a unit price or an amount.' };
    }
    if (!num(cur.amount)) return { ok: false, reason: 'Enter a unit price or an amount.' };
  } else {
    const s = applyStatusChange(cur, answer.kind, answer.kind === 'included' ? null : answer.reason);
    if (!step(s)) return s as AnswerResult;
  }

  const refused = countedHiddenRefusal(line, patch);
  if (refused) return { ok: false, reason: refused };
  return { ok: true, patch };
}

export interface PricingSettingsDraft { teamsUrl: string; hours: string; recipients: string[] }
export type PricingSettingsRow = { key: string; value: unknown };

/** Settings form → portal_settings rows, or the first problem. Blank webhook URL stores JSON null (Teams off). */
export function pricingSettingsRows(d: PricingSettingsDraft): { ok: true; rows: PricingSettingsRow[] } | { ok: false; error: string } {
  const url = d.teamsUrl.trim();
  if (url && !parseTeamsWebhookUrl(url)) return { ok: false, error: 'The Teams webhook URL must start with https://' };
  const hours = Number(d.hours);
  if (!d.hours.trim() || parseEscalationHours(hours) !== hours) return { ok: false, error: 'Escalation hours must be a number from 0.5 to 168.' };
  if (hours < 0.5) return { ok: false, error: 'Escalation hours must be a number from 0.5 to 168.' };
  const recipients = parseDigestRecipients(d.recipients);
  if (!recipients.length) return { ok: false, error: 'Keep at least one digest recipient.' };
  return {
    ok: true,
    rows: [
      { key: SETTINGS_KEYS.teamsWebhookUrl, value: url || null },
      { key: SETTINGS_KEYS.escalationHours, value: hours },
      { key: SETTINGS_KEYS.digestRecipients, value: recipients },
    ],
  };
}

/**
 * The buyer change-request fallback assignee (migration 0012) → its portal_settings row. Must be one of `staffIds`
 * (from staff_directory()); anything else, or none, stores JSON null.
 */
export function defaultAssigneeRow(id: string | null, staffIds: readonly string[]): PricingSettingsRow {
  const v = parseDefaultAssignee(id);
  return { key: DEFAULT_ASSIGNEE_KEY, value: v && staffIds.includes(v) ? v : null };
}
