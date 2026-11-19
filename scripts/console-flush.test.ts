// Phase 2 Task 8, Review Focus 1: every preview / export / navigation flushes first and refuses while unsaved.
import { test, expect, describe } from 'bun:test';
import { guardedAction, type GuardTarget } from '../src/lib/guardedAction';

type Snap = ReturnType<GuardTarget['snapshot']>;

/** A fake line store: `flush` applies `afterFlush`; records call order. */
function store(before: Snap, afterFlush: Snap) {
  const calls: string[] = [];
  let snap = before;
  const target: GuardTarget = {
    flush: async () => { calls.push('flush'); await Promise.resolve(); snap = afterFlush; },
    snapshot: () => snap,
  };
  return { target, calls };
}
const clean: Snap = { isDirty: false, saveState: { status: 'saved' } };
const dirty: Snap = { isDirty: true, saveState: { status: 'saving' } };
const failed: Snap = { isDirty: true, saveState: { status: 'error', error: 'permission denied' } };

describe('guardedAction', () => {
  test('dirty → flush → clean: flush runs BEFORE the renderer, then the renderer runs', async () => {
    const { target, calls } = store(dirty, clean);
    const r = await guardedAction(target, async () => { calls.push('render'); return 'pdf'; });
    expect(calls).toEqual(['flush', 'render']);
    expect(r).toEqual({ ok: true, value: 'pdf' });
  });
  test('clean still flushes first (a debounced edit may not be marked yet)', async () => {
    const { target, calls } = store(clean, clean);
    await guardedAction(target, () => { calls.push('render'); });
    expect(calls).toEqual(['flush', 'render']);
  });
  test('flush → still dirty: refused with a reason, renderer never called', async () => {
    const { target, calls } = store(dirty, dirty);
    const r = await guardedAction(target, () => { calls.push('render'); });
    expect(calls).toEqual(['flush']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not saved/i);
  });
  test('flush → save error: refused, the reason names the error', async () => {
    const { target, calls } = store(dirty, failed);
    const r = await guardedAction(target, () => { calls.push('render'); });
    expect(calls).toEqual(['flush']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('permission denied');
  });
  test('error status alone (not dirty) also refuses', async () => {
    const { target } = store(clean, { isDirty: false, saveState: { status: 'error', error: 'offline' } });
    const r = await guardedAction(target, () => 1);
    expect(r.ok).toBe(false);
  });
  test('the snapshot is read AFTER flush, not before', async () => {
    const { target } = store(clean, failed);
    expect((await guardedAction(target, () => 1)).ok).toBe(false);
  });
  test('a flush that throws refuses with its message', async () => {
    const target: GuardTarget = { flush: async () => { throw new Error('network down'); }, snapshot: () => clean };
    const r = await guardedAction(target, () => 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('network down');
  });
  test('loading refuses without flushing', async () => {
    const { target, calls } = store(clean, clean);
    const r = await guardedAction({ ...target, snapshot: () => ({ ...clean, loading: true }) }, () => 1);
    expect(r.ok).toBe(false);
    expect(calls).toEqual([]);
  });
  test('the action error propagates (renderer failures are the caller\'s toast)', async () => {
    const { target } = store(clean, clean);
    await expect(guardedAction(target, async () => { throw new Error('pdf failed'); })).rejects.toThrow('pdf failed');
  });
});

describe('fix round 1: the focused cell commits before the flush', () => {
  test('commitFocused runs first, its edit is flushed, then the renderer runs', async () => {
    const calls: string[] = [];
    let pendingDraft = false; let saved = false;
    const target: GuardTarget = {
      commitFocused: () => { calls.push('commit'); queueMicrotask(() => { pendingDraft = true; }); },
      flush: async () => { calls.push(`flush(pending=${pendingDraft})`); if (pendingDraft) saved = true; },
      snapshot: () => ({ isDirty: pendingDraft && !saved, saveState: { status: 'saved' } }),
    };
    const r = await guardedAction(target, () => { calls.push('render'); });
    expect(calls).toEqual(['commit', 'flush(pending=true)', 'render']);
    expect(r.ok).toBe(true);
  });
  test('a draft committed by commitFocused that then fails to save refuses the action', async () => {
    let dirty = false;
    const target: GuardTarget = {
      commitFocused: () => { dirty = true; },
      flush: async () => {},
      snapshot: () => ({ isDirty: dirty, saveState: { status: 'saving' } }),
    };
    const r = await guardedAction(target, () => 1);
    expect(r.ok).toBe(false);
  });
  test('loading refuses before committing anything', async () => {
    let committed = false;
    const r = await guardedAction({
      commitFocused: () => { committed = true; }, flush: async () => {}, snapshot: () => ({ ...clean, loading: true }),
    }, () => 1);
    expect(r.ok).toBe(false);
    expect(committed).toBe(false);
  });
});
