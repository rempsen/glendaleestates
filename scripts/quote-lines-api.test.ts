// Task 6: pure request builders for quote_lines (no supabase client involved).
import { test, expect, describe } from 'bun:test';
import { buildUpdate, buildInsert, buildReorder, FORBIDDEN_WRITE_KEYS } from '@/lib/quoteLinesApi';
import type { StoredLine } from '@/lib/quoteLinesReducer';

const line = (over: Partial<StoredLine> = {}): StoredLine => ({
  id: 'l1', submission_id: 's1', sort_order: 10, section: 'flooring', location: 'Kitchen', label: 'Premium LVP',
  unit: 'sqft', quantity: 100, unit_price: null, amount: null, pricing_mode: 'catalog', status: 'upgrade',
  client_visible: true, source: 'office', provisional: false, updated_at: '2026-11-18T10:00:00.000000+00:00',
  created_at: '2026-11-18T09:00:00+00:00', counts_in_total: true,
  ...over,
} as StoredLine);

const SERVER_OWNED = ['counts_in_total', 'created_at', 'updated_at', 'updated_by']; // updated_by: trigger 0016

describe('buildUpdate', () => {
  test('match carries id and the known updated_at (optimistic concurrency)', () => {
    const req = buildUpdate('l1', { label: 'New' }, '2026-11-18T10:00:00.000000+00:00');
    expect(req).toEqual({
      table: 'quote_lines',
      match: { id: 'l1', updated_at: '2026-11-18T10:00:00.000000+00:00' },
      values: { label: 'New' },
    });
  });

  test('never sends server-owned or identity columns, even if the patch carries them', () => {
    const dirty = {
      label: 'x', counts_in_total: false, created_at: 'a', updated_at: 'b', id: 'other', submission_id: 's9',
      internal_note_changed: true,
    } as Record<string, unknown>;
    const { values } = buildUpdate('l1', dirty as never, 'T');
    for (const k of [...SERVER_OWNED, 'id', 'submission_id', 'internal_note_changed']) expect(k in values).toBe(false);
    expect(values).toEqual({ label: 'x' });
  });

  test('drops undefined values but keeps explicit nulls (clearing a field)', () => {
    const { values } = buildUpdate('l1', { amount: null, client_note: undefined }, 'T');
    expect(values).toEqual({ amount: null });
  });
});

describe('buildInsert', () => {
  test('sends the client id and submission_id, never server-owned columns', () => {
    const req = buildInsert(line());
    expect(req.table).toBe('quote_lines');
    expect(req.values.id).toBe('l1');
    expect(req.values.submission_id).toBe('s1');
    expect(req.values.label).toBe('Premium LVP');
    for (const k of SERVER_OWNED) expect(k in req.values).toBe(false);
  });

  test('FORBIDDEN_WRITE_KEYS covers the generated and trigger-owned columns', () => {
    for (const k of SERVER_OWNED) expect(FORBIDDEN_WRITE_KEYS).toContain(k);
  });
});

describe('buildReorder', () => {
  test('assigns sort_order (i+1)*10 in the given order', () => {
    expect(buildReorder(['c', 'a', 'b'])).toEqual([
      { id: 'c', sort_order: 10 },
      { id: 'a', sort_order: 20 },
      { id: 'b', sort_order: 30 },
    ]);
  });
});
