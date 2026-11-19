// Task 13 fix round 1: a buyer change request nobody is flagged to is never invisible to staff. It appears under
// "Unassigned" in the pricing queue page and in the daily digest summary; the settings page stores the fallback
// assignee that request_quote_change() uses before NULL (rep order pinned in scripts/migration-0012.test.ts).
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_ASSIGNEE_KEY, OPEN_QUEUE_REST_FILTER, parseDefaultAssignee, queueRowsFromRest, type QueueRow,
} from '../supabase/functions/_shared/pricingQueue';
import { buildQueueViewModel, defaultAssigneeRow } from '../src/lib/pricingQueue';
import { handleDigest, type DigestDeps } from '../supabase/functions/pricing-digest/handler';

const NOW = new Date('2026-11-18T20:00:00Z');
const root = join(import.meta.dir, '..');
const flagged: QueueRow = {
  line_id: 'b1', submission_id: 's1', unit_number: '24', first_name: 'Jane', last_name: 'S', section: 'flooring',
  location: 'Stairs', label: 'Carpet', internal_note: null, flagged_to: 'u-brian', assignee_email: 'brian@bmdmaterials.com',
  assignee_first_name: 'Brian', assignee_last_name: 'Chornoboy', flagged_at: '2026-11-18T19:00:00Z',
};
// What the view / digest REST query returns for an unassigned buyer request (flagged_at is cleared by 0011's trigger).
const unassigned = queueRowsFromRest([{
  id: 'r1', submission_id: 's2', section: 'other', location: 'Buyer request', label: 'Add a pot light in the den',
  internal_note: null, flagged_to: null, flagged_at: null,
  buyer: { unit_number: '31', first_name: 'Ann', last_name: 'Lee' }, assignee: null,
}])[0];

describe('unassigned buyer requests', () => {
  test('queue page groups a NULL-assignee buyer_request under "Unassigned"', () => {
    const vm = buildQueueViewModel([flagged, unassigned], { now: NOW, escalationHours: 4, me: 'u-brian' });
    expect(vm.total).toBe(2);
    const g = vm.groups.find((x) => x.assigneeName === 'Unassigned');
    expect(g).toBeDefined();
    expect(g!.assigneeId).toBe('');
    expect(g!.items).toEqual([expect.objectContaining({
      lineId: 'r1', unit: 'Unit 31', buyer: 'Ann Lee', label: 'Add a pot light in the den', age: '—', overdue: false,
      href: '/admin/quotes/s2#line-r1',
    })]);
  });

  test('digest summary lists it under "Unassigned" and does not try to escalate it', async () => {
    const sent: Array<{ to: string[]; subject: string; text: string }> = [];
    const d: DigestDeps = {
      portalBase: 'https://portal.test', now: () => NOW,
      loadSettings: async () => ({ teamsUrl: null, escalationHours: 4, recipients: ['dan@bmdmaterials.com'] }),
      loadOpen: async () => [flagged, unassigned],
      sendEmail: async (m) => { sent.push(m); return { ok: true }; },
      postTeams: async () => ({ ok: true }),
    };
    const r = await handleDigest(d);
    expect(r.body).toMatchObject({ ok: true, open: 2, overdue: 0, summarySent: true });
    expect(r.body).not.toHaveProperty('errors');
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Unassigned (1)');
    expect(sent[0].text).toContain('Add a pot light in the den');
    expect(sent[0].text).toContain('/admin/quotes/s2#line-r1');
  });

  test('digest REST query uses the same predicate as the pricing_queue view', () => {
    expect(OPEN_QUEUE_REST_FILTER).toBe('status=eq.pending&or=(flagged_to.not.is.null,source.eq.buyer_request)');
    const src = readFileSync(join(root, 'supabase/functions/pricing-digest/index.ts'), 'utf8');
    expect(src).toContain('&${OPEN_QUEUE_REST_FILTER}&order=flagged_at.asc');
    expect(src).not.toContain('flagged_to=not.is.null');
    const sql = readFileSync(join(root, 'drizzle/migrations/0012_buyer_change_request.sql'), 'utf8');
    expect(sql).toContain("AND (ql.flagged_to IS NOT NULL OR ql.source = 'buyer_request')");
  });
});

describe('default assignee setting', () => {
  const brian = '11111111-2222-3333-4444-555555555555';
  test('parse: uuid or null', () => {
    expect(DEFAULT_ASSIGNEE_KEY).toBe('pricing_default_assignee');
    expect(parseDefaultAssignee(brian)).toBe(brian);
    expect(parseDefaultAssignee(null)).toBeNull();
    expect(parseDefaultAssignee('brian')).toBeNull();
    expect(parseDefaultAssignee(42)).toBeNull();
  });
  test('row: only a staff_directory() id is stored; otherwise JSON null', () => {
    expect(defaultAssigneeRow(brian, [brian])).toEqual({ key: DEFAULT_ASSIGNEE_KEY, value: brian });
    expect(defaultAssigneeRow(brian, [])).toEqual({ key: DEFAULT_ASSIGNEE_KEY, value: null });
    expect(defaultAssigneeRow(null, [brian])).toEqual({ key: DEFAULT_ASSIGNEE_KEY, value: null });
  });
  test('settings page loads it, picks from staff_directory() and saves it with the other keys', () => {
    const src = readFileSync(join(root, 'src/pages/AdminNotificationSettings.tsx'), 'utf8');
    expect(src).toContain("[...Object.values(SETTINGS_KEYS), DEFAULT_ASSIGNEE_KEY]");
    expect(src).toContain("supabase.rpc('staff_directory')");
    expect(src).toContain('defaultAssigneeRow(defaultAssignee, staff.map((p) => p.user_id))');
  });
});
