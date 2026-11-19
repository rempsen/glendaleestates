// Task 12: pricing queue pure parts — escalation selection, grouping by assignee, webhook decision + dedupe key,
// settings parsing (supabase/functions/_shared/pricingQueue.ts) and the page view model / answer patches
// (src/lib/pricingQueue.ts). Answers go through applyStatusChange / priceEditPatch and the counted ⇒ visible rule.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hoursSince, selectOverdue, groupByAssignee, formatAge, webhookDecision, notifyDedupeKey, consoleLink,
  parseEscalationHours, parseDigestRecipients, parseTeamsWebhookUrl, queueRowsFromRest, DEFAULT_ESCALATION_HOURS,
  type QueueRow,
} from '../supabase/functions/_shared/pricingQueue';
import { buildQueueViewModel, answerPatch, pricingSettingsRows } from '../src/lib/pricingQueue';
import { lineAnchor } from '../src/components/quote/consoleCells';
import { COUNTED_HIDDEN_REASON } from '../src/lib/quoteLinesReducer';

const NOW = new Date('2026-11-18T20:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  line_id: 'l1', submission_id: 's1', unit_number: '24', first_name: 'Jane', last_name: 'Safiniuk', section: 'flooring',
  location: 'Primary Bedroom', label: 'Premium underpad', internal_note: 'price per sq yd?', flagged_to: 'u-brian',
  assignee_email: 'brian@bmdmaterials.com', assignee_first_name: 'Brian', assignee_last_name: 'Chornoboy',
  flagged_at: hoursAgo(1), ...over,
});

describe('age', () => {
  test('hoursSince: null for missing / unparseable timestamps', () => {
    expect(hoursSince(hoursAgo(2.5), NOW)).toBeCloseTo(2.5, 6);
    expect(hoursSince(null, NOW)).toBeNull();
    expect(hoursSince('nope', NOW)).toBeNull();
  });
  test('formatAge', () => {
    expect(formatAge(null)).toBe('—');
    expect(formatAge(0.01)).toBe('1 min');
    expect(formatAge(0.5)).toBe('30 min');
    expect(formatAge(3.2)).toBe('3 h');
    expect(formatAge(24)).toBe('1 d');
    expect(formatAge(49.5)).toBe('2 d 1 h');
  });
});

describe('selectOverdue (escalation)', () => {
  const rows = [
    row({ line_id: 'a', flagged_at: hoursAgo(3.9) }),
    row({ line_id: 'b', flagged_at: hoursAgo(4) }),
    row({ line_id: 'c', flagged_at: hoursAgo(4.01) }),
    row({ line_id: 'd', flagged_at: hoursAgo(30) }),
    row({ line_id: 'e', flagged_at: null }),
  ];
  test('picks lines strictly older than N hours; unknown age is never overdue', () => {
    expect(selectOverdue(rows, 4, NOW).map((r) => r.line_id)).toEqual(['c', 'd']);
  });
  test('N comes from the setting', () => {
    expect(selectOverdue(rows, 24, NOW).map((r) => r.line_id)).toEqual(['d']);
  });
});

describe('groupByAssignee (digest)', () => {
  const rows = [
    row({ line_id: 'b1', flagged_at: hoursAgo(1) }),
    row({ line_id: 'd1', flagged_to: 'u-dan', assignee_email: 'dan@bmdmaterials.com', assignee_first_name: 'Dan', assignee_last_name: 'Rosenblat', flagged_at: hoursAgo(9) }),
    row({ line_id: 'b2', flagged_at: hoursAgo(5) }),
    row({ line_id: 'x1', flagged_to: 'u-x', assignee_email: 'x@bmdmaterials.com', assignee_first_name: null, assignee_last_name: null, flagged_at: null }),
  ];
  const groups = groupByAssignee(rows, NOW);

  test('one group per assignee, by name; email when the profile has no name', () => {
    expect(groups.map((g) => g.assigneeName)).toEqual(['Brian Chornoboy', 'Dan Rosenblat', 'x@bmdmaterials.com']);
    expect(groups[0]).toMatchObject({ assigneeId: 'u-brian', assigneeEmail: 'brian@bmdmaterials.com' });
  });
  test('lines oldest first; unknown age last; oldest age per group', () => {
    expect(groups[0].rows.map((r) => r.line_id)).toEqual(['b2', 'b1']);
    expect(groups[0].oldestHours).toBeCloseTo(5, 6);
    expect(groups[2].oldestHours).toBeNull();
  });
});

describe('webhookDecision (Database Webhook payload)', () => {
  const rec = { id: 'l1', flagged_to: 'u-brian', flagged_at: '2026-11-18T19:00:00+00:00', status: 'pending' };
  test('INSERT with an assignee → notify', () => {
    expect(webhookDecision({ type: 'INSERT', table: 'quote_lines', record: rec, old_record: null }))
      .toEqual({ act: true, lineId: 'l1', flaggedTo: 'u-brian', flaggedAt: '2026-11-18T19:00:00+00:00' });
  });
  test('UPDATE that changes flagged_to → notify; same assignee → skip', () => {
    expect(webhookDecision({ type: 'UPDATE', table: 'quote_lines', record: rec, old_record: { ...rec, flagged_to: 'u-dan' } }).act).toBe(true);
    expect(webhookDecision({ type: 'UPDATE', table: 'quote_lines', record: rec, old_record: { ...rec, flagged_to: null } }).act).toBe(true);
    expect(webhookDecision({ type: 'UPDATE', table: 'quote_lines', record: { ...rec, unit_price: 5 }, old_record: rec }))
      .toEqual({ act: false, reason: 'flagged_to unchanged' });
  });
  test('cleared assignee, removed line, other tables / events, garbage → skip', () => {
    expect(webhookDecision({ type: 'UPDATE', table: 'quote_lines', record: { ...rec, flagged_to: null }, old_record: rec }).act).toBe(false);
    expect(webhookDecision({ type: 'INSERT', table: 'quote_lines', record: { ...rec, status: 'removed' }, old_record: null }).act).toBe(false);
    expect(webhookDecision({ type: 'DELETE', table: 'quote_lines', record: null, old_record: rec }).act).toBe(false);
    expect(webhookDecision({ type: 'INSERT', table: 'profiles', record: rec, old_record: null }).act).toBe(false);
    expect(webhookDecision(null).act).toBe(false);
    expect(webhookDecision('x').act).toBe(false);
  });
  test('dedupe key: same line + assignee + flagged_at ⇒ same key (re-delivery sends no second card)', () => {
    const k = notifyDedupeKey('l1', 'u-brian', '2026-11-18T19:00:00+00:00');
    expect(k).toBe('pricing_request:l1:u-brian:2026-11-18T19:00:00+00:00');
    expect(notifyDedupeKey('l1', 'u-brian', '2026-11-18T19:05:00+00:00')).not.toBe(k);
    expect(notifyDedupeKey('l1', 'u-brian', null)).toBe('pricing_request:l1:u-brian:none');
  });
});

describe('settings parsing', () => {
  test('escalation hours: positive number ≤ 168, else default 4', () => {
    expect(DEFAULT_ESCALATION_HOURS).toBe(4);
    expect(parseEscalationHours(6)).toBe(6);
    expect(parseEscalationHours('2.5')).toBe(2.5);
    for (const bad of [0, -1, 'x', null, undefined, 1000, NaN, {}]) expect(parseEscalationHours(bad)).toBe(4);
  });
  test('digest recipients: valid emails, trimmed, de-duplicated; malformed → []', () => {
    expect(parseDigestRecipients([' dan@bmdmaterials.com', 'DAN@bmdmaterials.com', 'nope', 3, 'brian@bmdmaterials.com']))
      .toEqual(['dan@bmdmaterials.com', 'brian@bmdmaterials.com']);
    expect(parseDigestRecipients('dan@bmdmaterials.com')).toEqual([]);
  });
  test('Teams webhook URL: https only, else null', () => {
    expect(parseTeamsWebhookUrl(' https://prod-1.westus.logic.azure.com/workflows/abc ')).toBe('https://prod-1.westus.logic.azure.com/workflows/abc');
    for (const bad of [null, '', 'http://x.test/hook', 'javascript:alert(1)', 'not a url', 5]) expect(parseTeamsWebhookUrl(bad)).toBeNull();
  });
});

test('consoleLink is the console deep link', () => {
  expect(consoleLink('https://glendaleestates.lovable.app/', 's1', 'l1')).toBe('https://glendaleestates.lovable.app/admin/quotes/s1#line-l1');
});

test('queueRowsFromRest maps the service-role REST shape onto pricing_queue rows', () => {
  const rest = [{
    id: 'l1', submission_id: 's1', section: 'tile', location: null, label: 'Tile', internal_note: null, flagged_to: 'u1',
    flagged_at: 'T', buyer: { unit_number: '7', first_name: 'Al', last_name: 'Roy' },
    assignee: { email: 'b@x.test', first_name: 'B', last_name: 'C' },
  }, { id: 'l2', submission_id: 's2', label: 'X', flagged_to: 'u2', buyer: null, assignee: null }];
  expect(queueRowsFromRest(rest)).toEqual([
    { line_id: 'l1', submission_id: 's1', unit_number: '7', first_name: 'Al', last_name: 'Roy', section: 'tile', location: null, label: 'Tile', internal_note: null, flagged_to: 'u1', assignee_email: 'b@x.test', assignee_first_name: 'B', assignee_last_name: 'C', flagged_at: 'T' },
    { line_id: 'l2', submission_id: 's2', unit_number: null, first_name: null, last_name: null, section: null, location: null, label: 'X', internal_note: null, flagged_to: 'u2', assignee_email: null, assignee_first_name: null, assignee_last_name: null, flagged_at: null },
  ]);
});

describe('buildQueueViewModel (page)', () => {
  const rows = [
    row({ line_id: 'b1', flagged_at: hoursAgo(6) }),
    row({ line_id: 'd1', submission_id: 's9', unit_number: '31', first_name: 'B', last_name: 'C', flagged_to: 'u-dan', assignee_email: 'dan@bmdmaterials.com', assignee_first_name: 'Dan', assignee_last_name: 'Rosenblat', flagged_at: hoursAgo(1), location: null, internal_note: null }),
  ];

  test('counts, overdue flags, labels and console links', () => {
    const vm = buildQueueViewModel(rows, { now: NOW, escalationHours: 4 });
    expect(vm.total).toBe(2);
    expect(vm.overdue).toBe(1);
    expect(vm.groups.map((g) => g.assigneeName)).toEqual(['Brian Chornoboy', 'Dan Rosenblat']);
    expect(vm.groups[0].items[0]).toEqual({
      lineId: 'b1', submissionId: 's1', unit: 'Unit 24', buyer: 'Jane Safiniuk', location: 'Primary Bedroom',
      label: 'Premium underpad', note: 'price per sq yd?', age: '6 h', overdue: true, href: '/admin/quotes/s1#line-b1',
    });
    expect(vm.groups[1].items[0]).toMatchObject({ unit: 'Unit 31', location: '', note: null, overdue: false, href: '/admin/quotes/s9#line-d1' });
    expect(vm.groups[0].overdue).toBe(1);
  });

  test('the signed-in user’s group comes first', () => {
    const vm = buildQueueViewModel(rows, { now: NOW, escalationHours: 4, me: 'u-dan' });
    expect(vm.groups.map((g) => g.assigneeId)).toEqual(['u-dan', 'u-brian']);
    expect(vm.groups[0].mine).toBe(true);
  });

  test('empty queue', () => {
    expect(buildQueueViewModel([], { now: NOW, escalationHours: 4 })).toEqual({ total: 0, overdue: 0, groups: [] });
  });
});

describe('answerPatch (inline answer → reducer path)', () => {
  const pending = {
    status: 'pending' as const, quantity: 44, unit_price: null, amount: null, pricing_mode: 'catalog' as const,
    client_note: null, client_visible: true,
  };

  test('price with a quantity → unit_price, amount = qty × price, status upgrade, manual pricing', () => {
    expect(answerPatch(pending, { kind: 'price', unitPrice: 9.6 })).toEqual({
      ok: true, patch: { unit_price: 9.6, pricing_mode: 'manual', status: 'upgrade', amount: 422.4 },
    });
  });

  test('flat price without a quantity → amount typed directly', () => {
    expect(answerPatch({ ...pending, quantity: null }, { kind: 'price', amount: 350 })).toEqual({
      ok: true, patch: { pricing_mode: 'manual', status: 'upgrade', amount: 350 },
    });
  });

  test('price answer with neither price nor amount is refused (no $0 guess)', () => {
    expect(answerPatch(pending, { kind: 'price' })).toEqual({ ok: false, reason: 'Enter a unit price or an amount.' });
    expect(answerPatch({ ...pending, quantity: null }, { kind: 'price', unitPrice: 9 }).ok).toBe(false);
  });

  test('included → amount 0; deferred / under review need the buyer-facing reason', () => {
    expect(answerPatch(pending, { kind: 'included' })).toEqual({ ok: true, patch: { status: 'included', amount: 0 } });
    expect(answerPatch(pending, { kind: 'deferred', reason: '' })).toEqual({ ok: false, reason: 'Deferred needs a reason the buyer will see.' });
    expect(answerPatch(pending, { kind: 'deferred', reason: ' After possession ' })).toEqual({
      ok: true, patch: { status: 'deferred', client_note: 'After possession', amount: null },
    });
    expect(answerPatch(pending, { kind: 'under_review', reason: 'Checking supplier' }).ok).toBe(true);
  });

  test('a priced answer on a hidden line is refused with the counted ⇒ visible reason', () => {
    expect(answerPatch({ ...pending, client_visible: false }, { kind: 'price', unitPrice: 9.6 }))
      .toEqual({ ok: false, reason: COUNTED_HIDDEN_REASON });
    // Outside the total a hidden line is fine.
    expect(answerPatch({ ...pending, client_visible: false }, { kind: 'deferred', reason: 'Later' }).ok).toBe(true);
  });

  test('src/lib/pricingQueue.ts never writes quote_lines itself (answers go through useQuoteLines.upsert)', () => {
    const src = readFileSync(join(import.meta.dir, '../src/lib/pricingQueue.ts'), 'utf8');
    expect(src).not.toMatch(/supabase|\.update\(|\.from\(/);
    const page = readFileSync(join(import.meta.dir, '../src/pages/AdminPricingQueue.tsx'), 'utf8');
    expect(page).not.toMatch(/from\(['"]quote_lines['"]\)\s*\.\s*(update|insert|upsert)/);
    expect(page).toContain('useQuoteLines');
  });
});

test('_shared/pricingQueue.ts is import-free', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/pricingQueue.ts'), 'utf8');
  expect(src).not.toMatch(/^\s*import\s/m);
  expect(src).not.toMatch(/\bDeno\./);
});

describe('pricingSettingsRows (settings page save)', () => {
  const ok = { teamsUrl: ' https://prod-1.westus.logic.azure.com/workflows/abc ', hours: '4', recipients: ['dan@bmdmaterials.com', 'brian@bmdmaterials.com'] };
  test('valid form → the three portal_settings rows', () => {
    expect(pricingSettingsRows(ok)).toEqual({ ok: true, rows: [
      { key: 'teams_webhook_url', value: 'https://prod-1.westus.logic.azure.com/workflows/abc' },
      { key: 'pricing_escalation_hours', value: 4 },
      { key: 'pricing_digest_recipients', value: ['dan@bmdmaterials.com', 'brian@bmdmaterials.com'] },
    ] });
  });
  test('blank URL turns Teams off (JSON null)', () => {
    const r = pricingSettingsRows({ ...ok, teamsUrl: '' });
    expect(r.ok && r.rows[0]).toEqual({ key: 'teams_webhook_url', value: null });
  });
  test('refusals', () => {
    expect(pricingSettingsRows({ ...ok, teamsUrl: 'http://x.test' })).toEqual({ ok: false, error: 'The Teams webhook URL must start with https://' });
    for (const hours of ['', '0', '-2', 'x', '500', '0.1']) expect(pricingSettingsRows({ ...ok, hours }).ok).toBe(false);
    expect(pricingSettingsRows({ ...ok, recipients: [] })).toEqual({ ok: false, error: 'Keep at least one digest recipient.' });
  });
});

test('console row anchor matches the queue / Teams deep link', () => {
  expect(lineAnchor('abc')).toBe('line-abc');
  const vm = buildQueueViewModel([row({ line_id: 'abc', submission_id: 's1' })], { now: NOW, escalationHours: 4 });
  expect(vm.groups[0].items[0].href).toBe(`/admin/quotes/s1#${lineAnchor('abc')}`);
});
