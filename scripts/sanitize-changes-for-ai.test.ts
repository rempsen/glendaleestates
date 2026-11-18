// Mirror of supabase/functions/_shared/sanitizeChangesForAi.test.ts.
import { test, expect } from 'bun:test';
import { sanitizeChangesForAi, sanitizeAuditLogsForAi } from '../supabase/functions/_shared/sanitizeChangesForAi';

const changes = {
  sales_comments: { old: 'a', new: 'Private sales note' },
  admin_notes: { old: null, new: 'Private office note' },
  lvp_colour: { old: 'oak', new: 'ash' },
  area_upgrades: {
    old: [{ areaId: 'laundry', comments: 'INTERNAL old', clientComment: 'buyer old' }],
    new: [{ areaId: 'laundry', comments: 'INTERNAL new', clientComment: 'buyer new' }],
  },
};

test('top-level sales_comments and admin_notes removed', () => {
  const s = sanitizeChangesForAi(changes) as Record<string, unknown>;
  expect('sales_comments' in s).toBe(false);
  expect('admin_notes' in s).toBe(false);
});
test('nested area comments removed in old and new', () => {
  const s = sanitizeChangesForAi(changes) as any;
  expect(s.area_upgrades.old[0].comments).toBeUndefined();
  expect(s.area_upgrades.new[0].comments).toBeUndefined();
  expect(JSON.stringify(s)).not.toContain('INTERNAL');
  expect(JSON.stringify(s)).not.toContain('Private');
});
test('clientComment preserved', () => {
  const s = sanitizeChangesForAi(changes) as any;
  expect(s.area_upgrades.old[0].clientComment).toBe('buyer old');
  expect(s.area_upgrades.new[0].clientComment).toBe('buyer new');
});
test('unrelated keys preserved', () => {
  expect((sanitizeChangesForAi(changes) as any).lvp_colour).toEqual({ old: 'oak', new: 'ash' });
});
test('log list helper keeps other log fields and does not mutate input', () => {
  const logs = [{ created_at: 't', change_summary: 'Updated: LVP Color', changes }];
  const out = sanitizeAuditLogsForAi(logs);
  expect(out[0].created_at).toBe('t');
  expect(JSON.stringify(out)).not.toContain('Private');
  expect(logs[0].changes.sales_comments.new).toBe('Private sales note');
});

// quote_line_update shape written by the quote_lines_audit trigger (migration 0006).
const quoteLineUpdate = {
  line_id: 'l1',
  internal_note_changed: true,
  internal_note: 'TOP-SECRET top-level note',
  old: { status: 'pending', amount: null, internal_note: 'SECRET old note' },
  new: { status: 'upgrade', amount: 450, internal_note: 'SECRET new note' },
};
test('quote_line_update: internal_note stripped at top level and inside old/new', () => {
  const s = sanitizeChangesForAi(quoteLineUpdate) as any;
  expect(JSON.stringify(s)).not.toContain('SECRET');
  expect('internal_note' in s).toBe(false);
  expect(s.old).toEqual({ status: 'pending', amount: null });
  expect(s.new).toEqual({ status: 'upgrade', amount: 450 });
  expect(s.line_id).toBe('l1');
  expect(s.internal_note_changed).toBe(true);
  expect(quoteLineUpdate.old.internal_note).toBe('SECRET old note');
});
test('quote_line_update via log list helper', () => {
  const out = sanitizeAuditLogsForAi([{ change_summary: 'Quote line update', changes: quoteLineUpdate }]);
  expect(JSON.stringify(out)).not.toContain('SECRET');
});
