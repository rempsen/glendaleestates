// Core of pricing-digest with all I/O injected (tested in scripts/pricing-notify.test.ts).
// Escalation lives here, not in the webhook function: the webhook only sees the moment of flagging.
import { buildDigestCardOrText, teamsMessage, type DigestGroup } from '../_shared/adaptiveCard.ts';
import {
  consoleLink, formatAge, groupByAssignee, hoursSince, personName, selectOverdue, type QueueRow,
} from '../_shared/pricingQueue.ts';
import { safeEqual, type HeaderSource } from '../_shared/internalAuth.ts';
import type { EmailMessage, HandlerResult, SendResult } from '../notify-pricing-request/handler.ts';

export interface DigestSettings { teamsUrl: string | null; escalationHours: number; recipients: string[] }

export interface DigestDeps {
  portalBase: string;
  now(): Date;
  loadSettings(): Promise<DigestSettings>;
  /** Open pricing requests: OPEN_QUEUE_REST_FILTER (flagged pending lines and unassigned buyer requests). */
  loadOpen(): Promise<QueueRow[]>;
  sendEmail(msg: Omit<EmailMessage, 'html'> & { html: string }): Promise<SendResult>;
  postTeams(url: string, body: unknown): Promise<SendResult>;
}

/** Gate: header x-internal-secret equals env INTERNAL_SECRET (an unset or empty secret refuses everything). */
export function digestAuthorized(req: HeaderSource, secret: string | undefined): boolean {
  const got = req.headers.get('x-internal-secret');
  return !!secret && !!got && safeEqual(got, secret);
}

function toGroups(rows: QueueRow[], deps: DigestDeps, hours: number, now: Date): DigestGroup[] {
  return groupByAssignee(rows, now).map((g) => ({
    assigneeName: g.assigneeName,
    lines: g.rows.map((r) => {
      const age = hoursSince(r.flagged_at, now);
      return {
        unit: r.unit_number ?? '—',
        buyerName: personName(r.first_name, r.last_name),
        location: r.location ?? '',
        label: r.label ?? '',
        note: r.internal_note,
        ageLabel: formatAge(age),
        overdue: age != null && age > hours,
        link: consoleLink(deps.portalBase, r.submission_id, r.line_id),
      };
    }),
  }));
}

export async function handleDigest(deps: DigestDeps): Promise<HandlerResult> {
  const now = deps.now();
  const settings = await deps.loadSettings();
  const rows = await deps.loadOpen();
  const hours = settings.escalationHours;
  const queueLink = `${deps.portalBase.replace(/\/+$/, '')}/admin/pricing-queue`;
  const overdueRows = selectOverdue(rows, hours, now);
  const errors: string[] = [];
  const escalated: string[] = [];

  if (!rows.length) return { status: 200, body: { ok: true, open: 0, overdue: 0, escalated: [], summarySent: false } };

  // 1. Each assignee gets their own overdue lines.
  for (const g of groupByAssignee(overdueRows, now)) {
    if (!g.assigneeId) continue; // unassigned buyer requests: nobody to escalate to; they are in the summary
    if (!g.assigneeEmail) { errors.push(`${g.assigneeName}: no email`); continue; }
    const out = buildDigestCardOrText({
      groups: toGroups(g.rows, deps, hours, now), queueLink, escalationHours: hours, title: 'Your overdue pricing requests',
    });
    const r = await deps.sendEmail({ to: [g.assigneeEmail], subject: `Overdue pricing requests: ${g.rows.length}`, html: out.html, text: out.text });
    if (r.ok) escalated.push(g.assigneeEmail);
    else errors.push(`${g.assigneeEmail}: ${r.error}`);
  }

  // 2. Grouped summary of everything open to the digest recipients (Dan + whoever is set).
  const summary = buildDigestCardOrText({ groups: toGroups(rows, deps, hours, now), queueLink, escalationHours: hours });
  let summarySent = false;
  if (settings.recipients.length) {
    const r = await deps.sendEmail({ to: settings.recipients, subject: summary.subject, html: summary.html, text: summary.text });
    if (r.ok) summarySent = true;
    else errors.push(`summary: ${r.error}`);
  } else errors.push('summary: no digest recipients');
  if (settings.teamsUrl) {
    const r = await deps.postTeams(settings.teamsUrl, teamsMessage(summary.card));
    if (r.ok === false) errors.push(`teams: ${r.error}`);
  }

  const body = { ok: errors.length === 0, open: rows.length, overdue: overdueRows.length, escalated, summarySent, ...(errors.length ? { errors } : {}) };
  return { status: errors.length && !summarySent ? 502 : 200, body };
}
