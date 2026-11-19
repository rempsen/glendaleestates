// Phase 2 Task 8: moving a line to under_review / deferred needs a client-facing reason (spec §6.10).
import { test, expect, describe } from 'bun:test';
import { validateStatusChange, needsReason, STATUS_OPTIONS } from '../src/lib/statusChange';

describe('validateStatusChange', () => {
  test('under_review without a reason is rejected', () => {
    const r = validateStatusChange('upgrade', 'under_review', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/reason/i);
  });
  test('deferred with whitespace only is rejected', () => {
    expect(validateStatusChange('upgrade', 'deferred', '   ').ok).toBe(false);
    expect(validateStatusChange('pending', 'deferred', null).ok).toBe(false);
    expect(validateStatusChange('pending', 'deferred', undefined).ok).toBe(false);
  });
  test('under_review / deferred with a reason is accepted and the note is trimmed', () => {
    const r = validateStatusChange('upgrade', 'under_review', '  Confirming stair count with site  ');
    expect(r).toEqual({ ok: true, clientNote: 'Confirming stair count with site' });
    expect(validateStatusChange('upgrade', 'deferred', 'After possession').ok).toBe(true);
  });
  test('other moves need no reason and keep the existing note', () => {
    expect(validateStatusChange('under_review', 'upgrade', 'old')).toEqual({ ok: true, clientNote: 'old' });
    expect(validateStatusChange('upgrade', 'included', null)).toEqual({ ok: true, clientNote: null });
    expect(validateStatusChange('upgrade', 'pending', '')).toEqual({ ok: true, clientNote: null });
  });
  test('removed is not a status choice (use Remove with undo)', () => {
    const r = validateStatusChange('upgrade', 'removed', 'x');
    expect(r.ok).toBe(false);
    expect(STATUS_OPTIONS.map((o) => o.value)).not.toContain('removed');
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual(['included', 'upgrade', 'pending', 'under_review', 'deferred']);
  });
  test('needsReason', () => {
    expect(needsReason('under_review')).toBe(true);
    expect(needsReason('deferred')).toBe(true);
    expect(needsReason('upgrade')).toBe(false);
    expect(needsReason('pending')).toBe(false);
  });
  test('re-selecting under_review on a line already under review still needs its reason present', () => {
    expect(validateStatusChange('under_review', 'under_review', '').ok).toBe(false);
    expect(validateStatusChange('under_review', 'under_review', 'kept').ok).toBe(true);
  });
});
