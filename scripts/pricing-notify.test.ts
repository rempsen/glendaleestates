// Task 12: notify-pricing-request and pricing-digest handlers with injected I/O (no network in tests).
import { test, expect, describe } from 'bun:test';
import { handleNotify, type NotifyDeps, type LineContext } from '../supabase/functions/notify-pricing-request/handler';
import { handleDigest, digestAuthorized, type DigestDeps } from '../supabase/functions/pricing-digest/handler';
import { latestReviewPerLine, reviewRowsFromRest, reviewsSince, REVIEWS_REST_SELECT, type QueueRow, type ReviewRow } from '../supabase/functions/_shared/pricingQueue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FLAGGED_AT = '2026-11-18T19:00:00+00:00';
const payload = (over: Record<string, unknown> = {}) => ({
  type: 'UPDATE', table: 'quote_lines', schema: 'public',
  record: { id: 'l1', submission_id: 's1', flagged_to: 'u-brian', flagged_at: FLAGGED_AT, status: 'pending', ...over },
  old_record: { id: 'l1', submission_id: 's1', flagged_to: null, flagged_at: null, status: 'pending' },
});
const ctx: LineContext = {
  lineId: 'l1', submissionId: 's1', flaggedTo: 'u-brian', flaggedAt: FLAGGED_AT, status: 'pending',
  unit: '24', buyerName: 'Jane Safiniuk', location: 'Primary Bedroom', label: 'Premium underpad',
  product: 'Pad 10 mm', colour: null, internalNote: 'per sq yd?', assigneeName: 'Brian Chornoboy', assigneeEmail: 'brian@bmdmaterials.com',
};

function deps(over: Partial<NotifyDeps> = {}) {
  const calls = { teams: [] as unknown[], email: [] as Array<{ to: string[]; subject: string }>, claims: [] as string[] };
  const claimed = new Set<string>();
  const d: NotifyDeps = {
    portalBase: 'https://portal.test',
    getTeamsUrl: async () => 'https://prod.logic.azure.com/workflows/x',
    loadLine: async () => ctx,
    claim: async (key) => { calls.claims.push(key); if (claimed.has(key)) return false; claimed.add(key); return true; },
    postTeams: async (_url, body) => { calls.teams.push(body); return { ok: true }; },
    sendEmail: async (m) => { calls.email.push(m); return { ok: true }; },
    ...over,
  };
  return { d, calls };
}

const service = { ok: true as const, kind: 'service' as const };
const admin = { ok: true as const, kind: 'admin' as const, email: 'dan@bmdmaterials.com' };

describe('notify-pricing-request', () => {
  test('unauthorized → 401, nothing sent', async () => {
    const { d, calls } = deps();
    expect((await handleNotify(payload(), { ok: false, status: 401 }, d)).status).toBe(401);
    expect(calls.teams.length + calls.email.length).toBe(0);
  });

  test('flagging posts one Teams card with the deep link', async () => {
    const { d, calls } = deps();
    const r = await handleNotify(payload(), service, d);
    expect(r).toEqual({ status: 200, body: { ok: true, channel: 'teams' } });
    expect(calls.teams).toHaveLength(1);
    const json = JSON.stringify(calls.teams[0]);
    expect(json).toContain('https://portal.test/admin/quotes/s1#line-l1');
    expect(json).toContain('per sq yd?');
    expect(calls.claims).toEqual([`pricing_request:l1:u-brian:${FLAGGED_AT}`]);
  });

  test('re-delivery of the same flagging (same flagged_at) sends no second card', async () => {
    const { d, calls } = deps();
    await handleNotify(payload(), service, d);
    const again = await handleNotify(payload(), service, d);
    expect(again).toEqual({ status: 200, body: { ok: true, skipped: 'duplicate' } });
    expect(calls.teams).toHaveLength(1);
  });

  test('a new flagging of the same line (new flagged_at) notifies again', async () => {
    const { d, calls } = deps();
    await handleNotify(payload(), service, d);
    const later = '2026-11-18T21:00:00+00:00';
    d.loadLine = async () => ({ ...ctx, flaggedAt: later });
    await handleNotify(payload({ flagged_at: later }), service, d);
    expect(calls.teams).toHaveLength(2);
  });

  test('unchanged assignee → skipped before any I/O', async () => {
    const { d, calls } = deps();
    const p = payload();
    p.old_record.flagged_to = 'u-brian';
    expect((await handleNotify(p, service, d)).body).toEqual({ ok: true, skipped: 'flagged_to unchanged' });
    expect(calls.claims).toEqual([]);
  });

  test('stale delivery (line re-assigned or re-flagged since) → skipped', async () => {
    const { d, calls } = deps({ loadLine: async () => ({ ...ctx, flaggedTo: 'u-dan' }) });
    expect((await handleNotify(payload(), service, d)).body).toEqual({ ok: true, skipped: 'stale' });
    expect(calls.teams).toHaveLength(0);
  });

  test('Teams POST fails → Resend email to the assignee', async () => {
    const { d, calls } = deps({ postTeams: async () => ({ ok: false, error: 'HTTP 500' }) });
    const r = await handleNotify(payload(), service, d);
    expect(r.body).toEqual({ ok: true, channel: 'resend', teamsError: 'HTTP 500' });
    expect(calls.email).toHaveLength(1);
    expect(calls.email[0].to).toEqual(['brian@bmdmaterials.com']);
    expect(calls.email[0].subject).toContain('Unit 24');
  });

  test('no Teams URL → Resend email', async () => {
    const { d, calls } = deps({ getTeamsUrl: async () => null });
    expect((await handleNotify(payload(), service, d)).body).toEqual({ ok: true, channel: 'resend' });
    expect(calls.teams).toHaveLength(0);
    expect(calls.email).toHaveLength(1);
  });

  test('both channels fail → 502 with the errors', async () => {
    const { d } = deps({ postTeams: async () => ({ ok: false, error: 'HTTP 500' }), sendEmail: async () => ({ ok: false, error: 'no key' }) });
    const r = await handleNotify(payload(), service, d);
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ ok: false, channel: 'none' });
  });

  test('a signed-in admin may only send the test card, not fake a webhook', async () => {
    const { d, calls } = deps();
    expect((await handleNotify(payload(), admin, d)).status).toBe(403);
    expect(calls.teams).toHaveLength(0);
  });

  test('{test:true} posts a sample card and reports the channel', async () => {
    const { d, calls } = deps();
    expect(await handleNotify({ test: true }, admin, d)).toEqual({ status: 200, body: { ok: true, channel: 'teams' } });
    expect(JSON.stringify(calls.teams[0])).toContain('Test card');
    expect(calls.claims).toEqual([]);
  });

  test('{test:true} without Teams emails the admin who pressed it; failing Teams reports the error', async () => {
    const a = deps({ getTeamsUrl: async () => null });
    expect((await handleNotify({ test: true }, admin, a.d)).body).toEqual({ ok: true, channel: 'resend' });
    expect(a.calls.email[0].to).toEqual(['dan@bmdmaterials.com']);
    const b = deps({ postTeams: async () => ({ ok: false, error: 'HTTP 400' }) });
    expect((await handleNotify({ test: true }, admin, b.d)).body).toEqual({ ok: true, channel: 'resend', error: 'HTTP 400' });
    const c = deps({ getTeamsUrl: async () => null });
    expect((await handleNotify({ test: true }, service, c.d)).body).toEqual({ ok: false, channel: 'none', error: 'No Teams webhook URL is set and there is no signed-in email to send to.' });
  });
});

const NOW = new Date('2026-11-18T20:00:00Z');
const qrow = (over: Partial<QueueRow>): QueueRow => ({
  line_id: 'l', submission_id: 's', unit_number: '24', first_name: 'Jane', last_name: 'S', section: 'flooring', location: 'Stairs',
  label: 'Carpet', internal_note: null, flagged_to: 'u-brian', assignee_email: 'brian@bmdmaterials.com',
  assignee_first_name: 'Brian', assignee_last_name: 'Chornoboy', flagged_at: '2026-11-18T19:00:00Z', ...over,
});

describe('pricing-digest', () => {
  test('gate: x-internal-secret must equal INTERNAL_SECRET; unset secret refuses everything', () => {
    const h = (v: string | null) => ({ headers: { get: (n: string) => (n === 'x-internal-secret' ? v : null) } });
    expect(digestAuthorized(h('s3cret'), 's3cret')).toBe(true);
    expect(digestAuthorized(h('wrong'), 's3cret')).toBe(false);
    expect(digestAuthorized(h(null), 's3cret')).toBe(false);
    expect(digestAuthorized(h(''), '')).toBe(false);
    expect(digestAuthorized(h('x'), undefined)).toBe(false);
  });

  function ddeps(rows: QueueRow[], over: Partial<DigestDeps> = {}) {
    const sent: Array<{ to: string[]; subject: string; text: string }> = [];
    const teams: unknown[] = [];
    const d: DigestDeps = {
      portalBase: 'https://portal.test',
      now: () => NOW,
      loadSettings: async () => ({ teamsUrl: null, escalationHours: 4, recipients: ['dan@bmdmaterials.com', 'brian@bmdmaterials.com'] }),
      loadOpen: async () => rows,
      loadReviews: async () => [],
      sendEmail: async (m) => { sent.push(m); return { ok: true }; },
      postTeams: async (_u, b) => { teams.push(b); return { ok: true }; },
      ...over,
    };
    return { d, sent, teams };
  }

  test('emails each assignee their overdue lines, then the grouped summary to the recipients', async () => {
    const rows = [
      qrow({ line_id: 'b-old', flagged_at: '2026-11-18T10:00:00Z' }),
      qrow({ line_id: 'b-new', flagged_at: '2026-11-18T19:30:00Z' }),
      qrow({ line_id: 'd-old', flagged_to: 'u-dan', assignee_email: 'dan@bmdmaterials.com', assignee_first_name: 'Dan', assignee_last_name: 'Rosenblat', flagged_at: '2026-11-17T10:00:00Z' }),
    ];
    const { d, sent } = ddeps(rows);
    const r = await handleDigest(d);
    expect(r.body).toMatchObject({ ok: true, open: 3, overdue: 2, escalated: ['brian@bmdmaterials.com', 'dan@bmdmaterials.com'], summarySent: true });
    const brian = sent.find((m) => m.to[0] === 'brian@bmdmaterials.com' && m.subject.startsWith('Overdue'));
    expect(brian?.text).toContain('/admin/quotes/s#line-b-old');
    expect(brian?.text).not.toContain('b-new');
    const summary = sent.find((m) => m.to.length === 2);
    expect(summary?.subject).toBe('Pricing queue: 3 open, 2 overdue');
    expect(summary?.text.indexOf('Brian Chornoboy (2)')).toBeLessThan(summary?.text.indexOf('Dan Rosenblat (1)') ?? -1);
  });

  test('nothing open → no emails', async () => {
    const { d, sent } = ddeps([]);
    expect((await handleDigest(d)).body).toEqual({ ok: true, open: 0, overdue: 0, responses: 0, escalated: [], summarySent: false });
    expect(sent).toHaveLength(0);
  });

  test('summary also posts to Teams when a webhook is set (best effort)', async () => {
    const { d, teams } = ddeps([qrow({})], {
      loadSettings: async () => ({ teamsUrl: 'https://x.logic.azure.com/w', escalationHours: 4, recipients: ['dan@bmdmaterials.com'] }),
    });
    await handleDigest(d);
    expect(teams).toHaveLength(1);
  });

  test('email failure is reported, not thrown', async () => {
    const { d } = ddeps([qrow({ flagged_at: '2026-11-18T01:00:00Z' })], { sendEmail: async () => ({ ok: false, error: 'boom' }) });
    const r = await handleDigest(d);
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ ok: false, errors: ['brian@bmdmaterials.com: boom', 'summary: boom'] });
  });

  // ---- Buyer responses since yesterday (spec §6.7, Task 18) ----
  const review = (over: Partial<ReviewRow>): ReviewRow => ({
    line_id: 'l1', submission_id: 's24', unit_number: '24', first_name: 'Mike', last_name: 'B', location: 'Stairs to Lower Level',
    label: 'Premium carpet', response: 'questioned', comment: 'Is Catalyst the standard <colour>?', created_at: '2026-11-18T15:00:00Z', ...over,
  });

  test('latest response per line wins; ordered by unit', () => {
    const latest = latestReviewPerLine([
      review({ created_at: '2026-11-18T09:00:00Z', response: 'accepted', comment: null }),
      review({}),
      review({ line_id: 'l2', unit_number: '7', label: 'Premium underpad', response: 'accepted', comment: null }),
    ]);
    expect(latest.map((r) => [r.unit_number, r.line_id, r.response])).toEqual([['7', 'l2', 'accepted'], ['24', 'l1', 'questioned']]);
  });

  test('digest asks for the last 24 h and prints a "Buyer responses since yesterday" section with the comment', async () => {
    let since: Date | null = null;
    const { d, sent } = ddeps([qrow({})], { loadReviews: async (s) => { since = s; return [review({}), review({ line_id: 'l2', response: 'accepted', comment: null, label: 'Patio door panel track' })]; } });
    const r = await handleDigest(d);
    expect(since!.toISOString()).toBe(reviewsSince(NOW).toISOString());
    expect(since!.toISOString()).toBe('2026-11-17T20:00:00.000Z');
    expect(r.body).toMatchObject({ ok: true, open: 1, responses: 2, summarySent: true });
    const summary = sent.find((m) => m.to.length === 2)!;
    expect(summary.subject).toBe('Pricing queue: 1 open, 0 overdue · 2 buyer responses');
    expect(summary.text).toContain('Buyer responses since yesterday (2: 1 questioned, 1 accepted)');
    expect(summary.text).toContain('Questioned: Unit 24 · Mike B · Stairs to Lower Level · Premium carpet');
    expect(summary.text).toContain('Buyer: Is Catalyst the standard <colour>?');
    expect(summary.text).toContain('/admin/quotes/s24#line-l1');
    expect((summary as unknown as { html: string }).html).toContain('Is Catalyst the standard &lt;colour&gt;?');
  });

  test('responses alone (nothing open) still send the summary', async () => {
    const { d, sent } = ddeps([], { loadReviews: async () => [review({})] });
    const r = await handleDigest(d);
    expect(r.body).toMatchObject({ open: 0, responses: 1, summarySent: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('No open pricing requests.');
    expect(sent[0].text).toContain('Buyer responses since yesterday (1: 1 questioned, 0 accepted)');
  });

  test('REST mapping and query: reviews embed the line and the submission, newest first, since the window', () => {
    const [r] = reviewRowsFromRest([{ line_id: 'l9', response: 'accepted', comment: null, created_at: '2026-11-18T10:00:00Z',
      line: { submission_id: 's1', location: 'Kitchen', label: 'Backsplash', buyer: { unit_number: '4', first_name: 'A', last_name: 'B' } } }]);
    expect(r).toEqual({ line_id: 'l9', submission_id: 's1', unit_number: '4', first_name: 'A', last_name: 'B', location: 'Kitchen',
      label: 'Backsplash', response: 'accepted', comment: null, created_at: '2026-11-18T10:00:00Z' });
    const src = readFileSync(join(import.meta.dir, '../supabase/functions/pricing-digest/index.ts'), 'utf8');
    expect(src).toContain('quote_line_reviews?select=${REVIEWS_REST_SELECT}&created_at=gte.');
    expect(REVIEWS_REST_SELECT).toContain('line:quote_lines(');
  });
});
