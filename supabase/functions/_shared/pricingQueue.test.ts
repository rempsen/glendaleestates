// Deno tests: `deno test supabase/functions/`. No-op under bun (mirror: scripts/pricing-queue.test.ts).
import { groupByAssignee, notifyDedupeKey, selectOverdue, webhookDecision, type QueueRow } from './pricingQueue.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const now = new Date('2026-11-18T20:00:00Z');
  const r = (id: string, to: string, name: string, at: string | null): QueueRow => ({
    line_id: id, submission_id: 's', unit_number: '1', first_name: null, last_name: null, section: null, location: null,
    label: 'L', internal_note: null, flagged_to: to, assignee_email: `${name}@x.test`, assignee_first_name: name,
    assignee_last_name: null, flagged_at: at,
  });
  const rows = [r('a', 'u2', 'Dan', '2026-11-18T19:00:00Z'), r('b', 'u1', 'Brian', '2026-11-18T10:00:00Z'), r('c', 'u1', 'Brian', null)];

  denoTest('escalation picks lines older than N hours', () => eq(selectOverdue(rows, 4, now).map((x) => x.line_id), ['b']));
  denoTest('digest groups by assignee', () => eq(groupByAssignee(rows, now).map((g) => [g.assigneeName, g.rows.map((x) => x.line_id)]), [['Brian', ['b', 'c']], ['Dan', ['a']]]));
  denoTest('webhook acts only on a changed flagged_to', () => {
    const rec = { id: 'l', flagged_to: 'u1', flagged_at: 'T', status: 'pending' };
    eq(webhookDecision({ type: 'UPDATE', table: 'quote_lines', record: rec, old_record: { ...rec, flagged_to: null } }).act, true);
    eq(webhookDecision({ type: 'UPDATE', table: 'quote_lines', record: rec, old_record: rec }).act, false);
  });
  denoTest('dedupe key uses flagged_at', () => eq(notifyDedupeKey('l', 'u', 'T'), 'pricing_request:l:u:T'));
}
