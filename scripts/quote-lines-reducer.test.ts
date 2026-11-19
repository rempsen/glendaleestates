// Task 6: the pure reducer behind useQuoteLines (optimistic edits, acks, conflicts, realtime merge).
import { test, expect, describe } from 'bun:test';
import {
  quoteLinesReducer, initialQuoteLinesState, selectLines, selectIsDirty, CONFLICT_MESSAGE,
  describePatch, conflictMessage, describeUnsaved,
  type QuoteLinesState, type StoredLine,
} from '@/lib/quoteLinesReducer';
import { buildUpdate } from '@/lib/quoteLinesApi';

const T0 = '2026-11-18T10:00:00.000000+00:00';
const T1 = '2026-11-18T10:00:05.000000+00:00';
const T2 = '2026-11-18T10:00:09.000000+00:00';

const row = (id: string, over: Partial<StoredLine> = {}): StoredLine => ({
  id, submission_id: 's1', sort_order: 10, section: 'flooring', location: 'Kitchen', label: `Line ${id}`,
  unit: 'sqft', quantity: 100, unit_price: null, amount: 500, pricing_mode: 'manual', status: 'upgrade',
  client_visible: true, source: 'office', provisional: false, updated_at: T0,
  ...over,
} as StoredLine);

const loaded = (rows: StoredLine[]): QuoteLinesState =>
  quoteLinesReducer(initialQuoteLinesState, { type: 'loaded', rows });

describe('optimistic edit then ack', () => {
  test('edit applies immediately and marks the line dirty', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'Hall LVP' } });
    expect(s.lines.a.label).toBe('Hall LVP');
    expect(s.dirty.a).toEqual({ label: 'Hall LVP' });
    expect(selectIsDirty(s)).toBe(true);
  });

  test('saveStart moves the patch in flight; saveOk adopts the server row and clears state', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'Hall LVP' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    expect(s.inflight.a).toBe(true);
    expect(s.dirty.a).toBeUndefined();
    expect(s.saveState.status).toBe('saving');
    const at = new Date('2026-11-18T10:00:05Z');
    s = quoteLinesReducer(s, { type: 'saveOk', id: 'a', row: row('a', { label: 'Hall LVP', updated_at: T1 }), at });
    expect(s.inflight.a).toBeUndefined();
    expect(s.lines.a.updated_at).toBe(T1);
    expect(s.lines.a.label).toBe('Hall LVP');
    expect(s.saveState).toEqual({ status: 'saved', at });
    expect(selectIsDirty(s)).toBe(false);
  });

  test('a no-op edit (same value) does not mark the line dirty', () => {
    const s0 = loaded([row('a')]);
    const s = quoteLinesReducer(s0, { type: 'edit', id: 'a', patch: { label: 'Line a' } });
    expect(s).toBe(s0);
  });

  test('edit strips server-owned keys', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'x', updated_at: 'zzz', counts_in_total: false } as never });
    expect(s.dirty.a).toEqual({ label: 'x' });
    expect(s.lines.a.updated_at).toBe(T0);
  });
});

describe('edit during in-flight save', () => {
  test('is queued in dirty and survives the ack, overlaid on the acked row', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'first' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { quantity: 120 } });
    expect(s.inflight.a).toBe(true);
    expect(s.dirty.a).toEqual({ quantity: 120 });
    s = quoteLinesReducer(s, { type: 'saveOk', id: 'a', row: row('a', { label: 'first', updated_at: T1 }), at: new Date() });
    expect(s.lines.a.label).toBe('first');
    expect(s.lines.a.quantity).toBe(120); // queued edit still shown
    expect(s.lines.a.updated_at).toBe(T1); // next save will match on the acked timestamp
    expect(s.dirty.a).toEqual({ quantity: 120 });
    expect(selectIsDirty(s)).toBe(true);
  });
});

describe('conflict (Review Focus 3)', () => {
  test("keeps the other user's amount and drops (does not silently reapply) the local label", () => {
    let s = loaded([row('a', { label: 'orig', amount: 500 }), row('b', { sort_order: 20 })]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'A label' } });
    s = quoteLinesReducer(s, { type: 'edit', id: 'b', patch: { label: 'B still dirty' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    // User B changed the amount meanwhile; our UPDATE matched zero rows, we refetched:
    const serverB = row('a', { label: 'orig', amount: 750, updated_at: T2 });
    s = quoteLinesReducer(s, { type: 'saveConflict', id: 'a', row: serverB });
    expect(s.lines.a.amount).toBe(750);
    expect(s.lines.a.label).toBe('orig'); // A's patch dropped
    expect(s.lines.a.updated_at).toBe(T2);
    expect(s.dirty.a).toBeUndefined();
    expect(s.inflight.a).toBeUndefined();
    expect(s.saveState.status).toBe('error');
    expect(s.saveState.error).toBe(CONFLICT_MESSAGE);
    expect(s.saveState.error).toContain('someone else edited this line');
    // other dirty lines are untouched
    expect(s.dirty.b).toEqual({ label: 'B still dirty' });
    expect(s.lines.b.label).toBe('B still dirty');
  });

  test('also drops edits queued for that line during the conflicting save', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'one' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { quantity: 5 } });
    s = quoteLinesReducer(s, { type: 'saveConflict', id: 'a', row: row('a', { updated_at: T2 }) });
    expect(s.lines.a.quantity).toBe(100);
    expect(s.dirty.a).toBeUndefined();
  });
});

describe('save error', () => {
  test('restores the failed patch under any newer queued edits and records the message', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'x', quantity: 1 } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { quantity: 2 } });
    s = quoteLinesReducer(s, { type: 'saveError', ids: ['a'], message: 'network down', patches: { a: { label: 'x', quantity: 1 } } });
    expect(s.dirty.a).toEqual({ label: 'x', quantity: 2 });
    expect(s.inflight.a).toBeUndefined();
    expect(s.saveState).toEqual({ status: 'error', error: 'network down' });
  });
});

describe('remove', () => {
  test('sets status removed (never deletes) and excludes it from lines', () => {
    let s = loaded([row('a'), row('b', { sort_order: 20 })]);
    s = quoteLinesReducer(s, { type: 'remove', id: 'a' });
    expect(s.lines.a).toBeDefined();
    expect(s.lines.a.status).toBe('removed');
    expect(s.dirty.a).toEqual({ status: 'removed' });
    expect(selectLines(s).map((l) => l.id)).toEqual(['b']);
  });

  test('a never-saved local line is dropped locally (nothing to send)', () => {
    let s = loaded([]);
    s = quoteLinesReducer(s, { type: 'createLocal', line: row('n', { updated_at: '' }) });
    expect(s.pendingIds).toEqual(['n']);
    s = quoteLinesReducer(s, { type: 'remove', id: 'n' });
    expect(s.lines.n).toBeUndefined();
    expect(s.pendingIds).toEqual([]);
    expect(selectIsDirty(s)).toBe(false);
  });
});

describe('createLocal', () => {
  test('adds a pending line at its sort_order; saveOk clears pending', () => {
    let s = loaded([row('a', { sort_order: 10 }), row('b', { sort_order: 30 })]);
    s = quoteLinesReducer(s, { type: 'createLocal', line: row('n', { sort_order: 20, updated_at: '' }) });
    expect(selectLines(s).map((l) => l.id)).toEqual(['a', 'n', 'b']);
    expect(s.pendingIds).toEqual(['n']);
    expect(selectIsDirty(s)).toBe(true);
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['n'] });
    s = quoteLinesReducer(s, { type: 'saveOk', id: 'n', row: row('n', { sort_order: 20, updated_at: T1 }), at: new Date() });
    expect(s.pendingIds).toEqual([]);
    expect(s.lines.n.updated_at).toBe(T1);
  });
});

describe('remoteChange', () => {
  test('ignored while the line is dirty', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'mine' } });
    const s2 = quoteLinesReducer(s, { type: 'remoteChange', row: row('a', { label: 'theirs', updated_at: T1 }) });
    expect(s2).toBe(s);
  });

  test('ignored while the line is in flight', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'mine' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    const s2 = quoteLinesReducer(s, { type: 'remoteChange', row: row('a', { label: 'mine', updated_at: T1 }) });
    expect(s2).toBe(s);
  });

  test('ignored when it is the echo of a row we just acked (same updated_at)', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'mine' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    s = quoteLinesReducer(s, { type: 'saveOk', id: 'a', row: row('a', { label: 'mine', updated_at: T1 }), at: new Date() });
    const s2 = quoteLinesReducer(s, { type: 'remoteChange', row: row('a', { label: 'mine', updated_at: T1 }) });
    expect(s2).toBe(s);
  });

  test('ignored when older than what we hold', () => {
    const s = loaded([row('a', { updated_at: T1 })]);
    expect(quoteLinesReducer(s, { type: 'remoteChange', row: row('a', { label: 'stale', updated_at: T0 }) })).toBe(s);
  });

  test('merged otherwise, including new lines and re-sorting', () => {
    let s = loaded([row('a', { sort_order: 10 }), row('b', { sort_order: 20 })]);
    s = quoteLinesReducer(s, { type: 'remoteChange', row: row('a', { label: 'theirs', sort_order: 30, updated_at: T1 }) });
    expect(s.lines.a.label).toBe('theirs');
    s = quoteLinesReducer(s, { type: 'remoteChange', row: row('c', { sort_order: 5, updated_at: T1 }) });
    expect(selectLines(s).map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });

  test('a remote removal hides the line', () => {
    let s = loaded([row('a'), row('b', { sort_order: 20 })]);
    s = quoteLinesReducer(s, { type: 'remoteChange', row: row('a', { status: 'removed', updated_at: T1 }) });
    expect(selectLines(s).map((l) => l.id)).toEqual(['b']);
  });
});

describe('reorder', () => {
  test('updates order and sort_order, marking only changed lines dirty', () => {
    let s = loaded([row('a', { sort_order: 10 }), row('b', { sort_order: 20 }), row('c', { sort_order: 30 })]);
    s = quoteLinesReducer(s, { type: 'reorder', ids: ['a', 'c', 'b'] });
    expect(s.order).toEqual(['a', 'c', 'b']);
    expect(selectLines(s).map((l) => [l.id, l.sort_order])).toEqual([['a', 10], ['c', 20], ['b', 30]]);
    expect(s.dirty.a).toBeUndefined();
    expect(s.dirty.c).toEqual({ sort_order: 20 });
    expect(s.dirty.b).toEqual({ sort_order: 30 });
  });
});

describe('loaded (refresh)', () => {
  test('keeps local dirty overlays, in-flight lines and pending lines', () => {
    let s = loaded([row('a'), row('b', { sort_order: 20 })]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'mine' } });
    s = quoteLinesReducer(s, { type: 'createLocal', line: row('n', { sort_order: 30, updated_at: '' }) });
    s = quoteLinesReducer(s, { type: 'loaded', rows: [row('a', { amount: 9, updated_at: T1 }), row('b', { label: 'fresh', sort_order: 20, updated_at: T1 })] });
    expect(s.lines.a.label).toBe('mine');
    expect(s.lines.a.amount).toBe(9);
    expect(s.lines.b.label).toBe('fresh');
    expect(s.lines.n).toBeDefined();
    expect(selectLines(s).map((l) => l.id)).toEqual(['a', 'b', 'n']);
  });
});

describe('fix round 1: refresh must not re-base a dirty line', () => {
  test("loaded keeps the dirty line's old updated_at, so the save conflicts and then shows the other user's amount", () => {
    let s = loaded([row('x', { label: 'orig', amount: 500 })]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'x', patch: { label: 'Premium underpad' } });
    // refresh(): another user changed the amount and saved (newer updated_at).
    s = quoteLinesReducer(s, { type: 'loaded', rows: [row('x', { label: 'orig', amount: 750, updated_at: T2 })] });
    expect(s.lines.x.updated_at).toBe(T0);
    expect(s.lines.x.label).toBe('Premium underpad');
    expect(s.dirty.x).toEqual({ label: 'Premium underpad' });
    const req = buildUpdate('x', s.dirty.x, s.lines.x.updated_at);
    expect(req.match.updated_at).toBe(T0); // the OLD timestamp: the guarded UPDATE matches zero rows
    const sent = s.dirty.x;
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['x'] });
    s = quoteLinesReducer(s, { type: 'saveConflict', id: 'x', row: row('x', { label: 'orig', amount: 750, updated_at: T2 }), sent });
    expect(s.lines.x.amount).toBe(750);
    expect(s.lines.x.updated_at).toBe(T2);
    expect(s.lastConflict).toEqual({ id: 'x', dropped: { label: 'Premium underpad' } });
  });

  test('a clean line adopts the fresh row (including updated_at) on loaded', () => {
    let s = loaded([row('x')]);
    s = quoteLinesReducer(s, { type: 'loaded', rows: [row('x', { amount: 750, updated_at: T2 })] });
    expect(s.lines.x).toEqual(row('x', { amount: 750, updated_at: T2 }));
  });
});

describe('fix round 1: conflicts report what they dropped', () => {
  test('lastConflict holds the sent patch plus edits queued behind it (queued wins)', () => {
    let s = loaded([row('a')]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { label: 'Premium underpad', quantity: 40 } });
    const sent = s.dirty.a;
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['a'] });
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { quantity: 44 } });
    s = quoteLinesReducer(s, { type: 'saveConflict', id: 'a', row: row('a', { updated_at: T2 }), sent });
    expect(s.lastConflict).toEqual({ id: 'a', dropped: { label: 'Premium underpad', quantity: 44 } });
    expect(conflictMessage(s.lastConflict!.dropped)).toBe(
      'Reloaded — someone else edited this line. Your unsaved changes: label → "Premium underpad", quantity → 44');
  });

  test('initial state has no conflict; message falls back when nothing was dropped', () => {
    expect(initialQuoteLinesState.lastConflict).toBeNull();
    expect(conflictMessage({})).toBe(CONFLICT_MESSAGE);
    expect(describePatch({ status: 'removed', unit_price: null, provisional: true })).toBe(
      'status → "removed", unit_price → null, provisional → true');
  });

  test('describeUnsaved names dirty, in-flight and un-inserted lines with their pending values', () => {
    let s = loaded([row('a', { label: 'Hall LVP' }), row('b', { sort_order: 20, label: 'Tile', location: '' }), row('c', { sort_order: 30 })]);
    s = quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { quantity: 44 } });
    s = quoteLinesReducer(s, { type: 'edit', id: 'b', patch: { label: 'Bath tile' } });
    s = quoteLinesReducer(s, { type: 'saveStart', ids: ['b'] });
    expect(describeUnsaved(s)).toEqual(['Hall LVP (Kitchen): quantity → 44', 'Bath tile']);
  });
});

// ---- Task 10 fix round 1: counted ⇒ client_visible at write time ----
import { countedHiddenRefusal, COUNTED_HIDDEN_REASON } from '@/lib/quoteLinesReducer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('counted lines must stay visible to the buyer', () => {
  test('the refusal reason is the console toast text', () => {
    expect(COUNTED_HIDDEN_REASON).toBe('A priced line must be visible to the buyer — set it to Under review or Deferred instead');
  });
  test('hiding a counted line is refused and leaves state untouched', () => {
    const s = loaded([row('a')]);
    expect(countedHiddenRefusal(s.lines.a, { client_visible: false })).toBe(COUNTED_HIDDEN_REASON);
    expect(quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { client_visible: false } })).toBe(s);
  });
  test('pricing a hidden line (or making a hidden priced line count) is refused', () => {
    const s = loaded([row('h', { client_visible: false, status: 'under_review', amount: null })]);
    expect(quoteLinesReducer(s, { type: 'edit', id: 'h', patch: { status: 'upgrade', amount: 300 } })).toBe(s);
    const priced = loaded([row('p', { client_visible: false, status: 'deferred', amount: 300 })]);
    expect(quoteLinesReducer(priced, { type: 'edit', id: 'p', patch: { status: 'upgrade' } })).toBe(priced);
    const pending = loaded([row('q', { client_visible: false, status: 'upgrade', amount: null })]);
    expect(quoteLinesReducer(pending, { type: 'edit', id: 'q', patch: { amount: 10 } })).toBe(pending);
  });
  test('allowed: hiding a line outside the total, hiding while moving it out, and fixing a legacy violator', () => {
    const s = loaded([row('a'), row('b', { status: 'pending', amount: null })]);
    expect(quoteLinesReducer(s, { type: 'edit', id: 'b', patch: { client_visible: false } }).lines.b.client_visible).toBe(false);
    expect(quoteLinesReducer(s, { type: 'edit', id: 'a', patch: { status: 'under_review', client_visible: false } }).lines.a.status).toBe('under_review');
    const legacy = loaded([row('l', { client_visible: false })]);
    expect(quoteLinesReducer(legacy, { type: 'edit', id: 'l', patch: { client_visible: true } }).lines.l.client_visible).toBe(true);
    expect(quoteLinesReducer(legacy, { type: 'edit', id: 'l', patch: { status: 'deferred' } }).lines.l.status).toBe('deferred');
  });
  test('creating a counted hidden line is refused; a hidden pending one is allowed', () => {
    const s = loaded([]);
    expect(quoteLinesReducer(s, { type: 'createLocal', line: row('n', { client_visible: false, updated_at: '' }) })).toBe(s);
    expect(quoteLinesReducer(s, { type: 'createLocal', line: row('m', { client_visible: false, status: 'pending', amount: null, updated_at: '' }) }).lines.m).toBeDefined();
  });
  test('useQuoteLines toasts the reason on a refused edit or create', () => {
    const hook = readFileSync(join(import.meta.dir, '../src/hooks/useQuoteLines.ts'), 'utf8');
    expect(hook.match(/if \(refused\) \{ toast\.error\(refused\);/g)?.length).toBe(2);
  });
});
