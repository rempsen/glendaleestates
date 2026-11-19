// Review Focus 1 (Phase 2 Task 8): every client preview, Word, PDF and navigation from the meeting console first
// flushes pending line saves, then runs only if nothing is left unsaved and the last save did not fail.
import type { SaveState } from '@/lib/quoteLinesReducer';

export interface GuardSnapshot {
  isDirty: boolean;
  saveState: Pick<SaveState, 'status' | 'error'>;
  loading?: boolean;
}

export interface GuardTarget {
  /**
   * Commits the focused cell's draft (the console blurs document.activeElement). iPad Safari may not blur an input
   * when a button is tapped, so an uncommitted draft would be invisible to `isDirty` and skipped by `flush`.
   */
  commitFocused?: () => void;
  flush: () => Promise<void>;
  /** Read synchronously from the store AFTER flush (React render state would be stale inside the await). */
  snapshot: () => GuardSnapshot;
}

export type GuardResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export async function guardedAction<T>(target: GuardTarget, action: () => T | Promise<T>): Promise<GuardResult<T>> {
  if (target.snapshot().loading) return { ok: false, reason: 'Lines are still loading — try again in a moment.' };
  if (target.commitFocused) {
    target.commitFocused();
    await Promise.resolve(); // let the cell's commit land in the store before flushing
  }
  try {
    await target.flush();
  } catch (e) {
    return { ok: false, reason: `Could not save changes: ${e instanceof Error ? e.message : String(e)}` };
  }
  const s = target.snapshot();
  if (s.saveState.status === 'error') {
    return { ok: false, reason: `Last save failed${s.saveState.error ? ` (${s.saveState.error})` : ''} — retry before continuing.` };
  }
  if (s.isDirty) return { ok: false, reason: 'Some changes are not saved yet — wait for "Saved ✓" and try again.' };
  return { ok: true, value: await action() };
}
