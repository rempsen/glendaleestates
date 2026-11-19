// Status rules for the meeting console (spec §6.10): under review / deferred lines carry a client-facing reason.
import type { LineStatus } from '@/lib/quoteLines';

/** The choices in the console's status menu. `removed` is not one: it is the Remove action (with undo). */
export const STATUS_OPTIONS: ReadonlyArray<{ value: Exclude<LineStatus, 'removed'>; label: string }> = [
  { value: 'included', label: 'Included' },
  { value: 'upgrade', label: 'Upgrade' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'deferred', label: 'Deferred' },
];

export const needsReason = (to: LineStatus): boolean => to === 'under_review' || to === 'deferred';

export type StatusChangeResult = { ok: true; clientNote: string | null } | { ok: false; reason: string };

/**
 * Validates a status change. `clientNote` is the line's client note after the change (the reason typed in the prompt,
 * pre-filled with the existing note). Moving to under_review / deferred is refused without a non-blank reason.
 */
export function validateStatusChange(
  _from: LineStatus, to: LineStatus, clientNote: string | null | undefined,
): StatusChangeResult {
  if (to === 'removed') return { ok: false, reason: 'Use Remove to take a line off the quote.' };
  const note = (clientNote ?? '').trim() || null;
  if (needsReason(to) && !note) {
    const label = STATUS_OPTIONS.find((o) => o.value === to)?.label ?? to;
    return { ok: false, reason: `${label} needs a reason the buyer will see.` };
  }
  return { ok: true, clientNote: note };
}
