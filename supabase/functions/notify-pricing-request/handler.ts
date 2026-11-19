// Core of notify-pricing-request with all I/O injected (tested in scripts/pricing-notify.test.ts).
import {
  buildPricingRequestCard, samplePricingRequestInput, teamsMessage, type PricingRequestCardInput,
} from '../_shared/adaptiveCard.ts';
import { consoleLink, notifyDedupeKey, webhookDecision } from '../_shared/pricingQueue.ts';
import type { InternalAuthResult } from '../_shared/internalAuth.ts';

/** Fresh state of the flagged line, read with the service role. No buyer email / phone. */
export interface LineContext {
  lineId: string;
  submissionId: string;
  flaggedTo: string | null;
  flaggedAt: string | null;
  status: string;
  unit: string;
  buyerName: string;
  location: string;
  label: string;
  product: string | null;
  colour: string | null;
  internalNote: string | null;
  assigneeName: string;
  assigneeEmail: string | null;
}

export type SendResult = { ok: true } | { ok: false; error: string };
export interface EmailMessage { to: string[]; subject: string; html: string; text: string }

export interface NotifyDeps {
  portalBase: string;
  getTeamsUrl(): Promise<string | null>;
  loadLine(lineId: string): Promise<LineContext | null>;
  /** Records the dedupe key; false when it was already recorded (re-delivery). */
  claim(key: string, info: { lineId: string; submissionId: string; flaggedTo: string; flaggedAt: string | null }): Promise<boolean>;
  postTeams(url: string, body: unknown): Promise<SendResult>;
  sendEmail(msg: EmailMessage): Promise<SendResult>;
}

export type Channel = 'teams' | 'resend' | 'none';
export interface HandlerResult { status: number; body: Record<string, unknown> }

/** Same timestamp (REST and webhook payloads may format it differently); unknown on either side counts as same. */
function sameInstant(a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return true;
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isNaN(x) || Number.isNaN(y) ? false : x === y;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function requestEmail(input: PricingRequestCardInput, to: string): EmailMessage {
  const rows: Array<[string, string]> = [
    ['Unit', input.unit], ['Buyer', input.buyerName], ['Location', input.location || '—'], ['Item', input.label],
  ];
  const product = [input.product, input.colour].filter((s) => s && s.trim()).join(' · ');
  if (product) rows.push(['Product', product]);
  if (input.note?.trim()) rows.push(['Note', input.note.trim()]);
  const subject = `Pricing request: Unit ${input.unit} — ${input.label}`;
  const text = [`${subject}`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `Open in portal: ${input.link}`].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937">`
    + `<h2 style="margin:0 0 8px">Pricing request for ${esc(input.assigneeName)}</h2><table style="border-collapse:collapse">`
    + rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
    + `</table><p style="margin-top:16px"><a href="${esc(input.link)}">Open in portal</a></p></div>`;
  return { to: [to], subject, html, text };
}

/** Teams first; on no URL or a failed POST, Resend email to `fallbackTo`. */
async function deliver(deps: NotifyDeps, input: PricingRequestCardInput, fallbackTo: string | null) {
  const url = await deps.getTeamsUrl();
  let teamsError: string | undefined;
  if (url) {
    const r = await deps.postTeams(url, teamsMessage(buildPricingRequestCard(input)));
    if (r.ok) return { channel: 'teams' as Channel };
    teamsError = r.error;
  }
  if (!fallbackTo) return { channel: 'none' as Channel, teamsError, emailError: 'no email address to fall back to' };
  const e = await deps.sendEmail(requestEmail(input, fallbackTo));
  if (e.ok) return { channel: 'resend' as Channel, teamsError };
  return { channel: 'none' as Channel, teamsError, emailError: e.error };
}

export async function handleNotify(body: unknown, auth: InternalAuthResult, deps: NotifyDeps): Promise<HandlerResult> {
  if (auth.ok === false) return { status: 401, body: { ok: false, error: 'Unauthorized' } };

  if (body && typeof body === 'object' && (body as { test?: unknown }).test === true) {
    const to = auth.kind === 'admin' ? auth.email ?? null : null;
    const input = samplePricingRequestInput(`${deps.portalBase.replace(/\/+$/, '')}/admin/pricing-queue`);
    const url = await deps.getTeamsUrl();
    if (!url && !to) {
      return { status: 200, body: { ok: false, channel: 'none', error: 'No Teams webhook URL is set and there is no signed-in email to send to.' } };
    }
    const r = await deliver(deps, input, to);
    if (r.channel === 'none') return { status: 200, body: { ok: false, channel: 'none', error: [r.teamsError, r.emailError].filter(Boolean).join('; ') } };
    return { status: 200, body: { ok: true, channel: r.channel, ...(r.teamsError ? { error: r.teamsError } : {}) } };
  }

  // Webhook deliveries come from the Database Webhook (service role), never from a browser session.
  if (auth.kind !== 'service' && auth.kind !== 'internal') return { status: 403, body: { ok: false, error: 'Webhook payloads need the service role' } };

  const decision = webhookDecision(body);
  if (decision.act === false) return { status: 200, body: { ok: true, skipped: decision.reason } };

  const line = await deps.loadLine(decision.lineId);
  if (!line) return { status: 200, body: { ok: true, skipped: 'line not found' } };
  // A late or re-ordered delivery must not announce a flagging that has since changed.
  if (line.flaggedTo !== decision.flaggedTo || !sameInstant(line.flaggedAt, decision.flaggedAt)) {
    return { status: 200, body: { ok: true, skipped: 'stale' } };
  }
  if (line.status === 'removed') return { status: 200, body: { ok: true, skipped: 'line removed' } };

  const key = notifyDedupeKey(line.lineId, decision.flaggedTo, decision.flaggedAt);
  const fresh = await deps.claim(key, { lineId: line.lineId, submissionId: line.submissionId, flaggedTo: decision.flaggedTo, flaggedAt: decision.flaggedAt });
  if (!fresh) return { status: 200, body: { ok: true, skipped: 'duplicate' } };

  const input: PricingRequestCardInput = {
    unit: line.unit, buyerName: line.buyerName, location: line.location, label: line.label,
    product: line.product, colour: line.colour, note: line.internalNote, assigneeName: line.assigneeName,
    link: consoleLink(deps.portalBase, line.submissionId, line.lineId),
  };
  const r = await deliver(deps, input, line.assigneeEmail);
  if (r.channel === 'none') {
    return { status: 502, body: { ok: false, channel: 'none', error: [r.teamsError, r.emailError].filter(Boolean).join('; ') } };
  }
  return { status: 200, body: { ok: true, channel: r.channel, ...(r.teamsError ? { teamsError: r.teamsError } : {}) } };
}
