// Pure patches for console line edits (Task 8 fix round 1). The page and LineRow only apply what these return.
// Rules: a pending line has no amount (spec §6.1: "Pending", never a number); under review / deferred lines keep a
// client-facing reason; amount = qty × unit price only through lineAmount.
import type { LineStatus, QuoteLine } from '@/lib/quoteLines';
import { lineAmount } from '@/lib/lineAmount';
import { needsReason, validateStatusChange } from '@/lib/statusChange';

type Line = Pick<QuoteLine, 'status' | 'quantity' | 'unit_price' | 'amount' | 'pricing_mode' | 'client_note'>;
export type EditPatch = Partial<Pick<QuoteLine, 'status' | 'quantity' | 'unit_price' | 'amount' | 'pricing_mode' | 'client_note'>>;
export type EditResult = { ok: true; patch: EditPatch } | { ok: false; reason: string };

/**
 * Status change → patch. `reason` is the client note entered in the prompt (ignored unless the target needs one).
 * Moving to `pending` clears the amount; moving out of `pending` restores it (see below).
 */
export function applyStatusChange(line: Line, to: LineStatus, reason?: string | null): EditResult {
  const v = validateStatusChange(line.status, to, needsReason(to) ? reason : line.client_note);
  if (v.ok === false) return v;
  const patch: EditPatch = { status: to };
  if (needsReason(to)) patch.client_note = v.clientNote;
  if (to === 'pending') patch.amount = null;
  // Leaving pending (request pricing → priced → Upgrade): restore qty × unit price, or 0 for an inclusion. With no
  // qty/unit price the amount stays null and LineRow's amount cell is editable (it locks only while pending).
  else if (line.status === 'pending') patch.amount = to === 'included' ? 0 : lineAmount(line.quantity, line.unit_price, null);
  return { ok: true, patch };
}

const manual = (line: Line): EditPatch => (line.pricing_mode === 'manual' ? {} : { pricing_mode: 'manual' });

/** Qty / unit price / amount edit → patch. A pending line never gets an amount. */
export function priceEditPatch(
  line: Line,
  edit: { quantity: number | null } | { unit_price: number | null } | { amount: number | null },
): EditResult {
  const pending = line.status === 'pending';
  if ('quantity' in edit) {
    return { ok: true, patch: pending ? { quantity: edit.quantity } : { quantity: edit.quantity, amount: lineAmount(edit.quantity, line.unit_price, line.amount) } };
  }
  if ('unit_price' in edit) {
    return {
      ok: true,
      patch: pending
        ? { unit_price: edit.unit_price, ...manual(line) }
        : { unit_price: edit.unit_price, amount: lineAmount(line.quantity, edit.unit_price, line.amount), ...manual(line) },
    };
  }
  if (pending) return { ok: false, reason: 'A pending line has no amount — set it to Upgrade once it is priced.' };
  return { ok: true, patch: { amount: lineAmount(null, null, edit.amount), ...manual(line) } };
}

/** Client-note edit → patch; under review / deferred lines cannot lose their reason. */
export function clientNoteEdit(line: Line, draft: string): EditResult {
  const note = draft.trim() || null;
  if (!note && needsReason(line.status)) {
    return { ok: false, reason: 'This line is under review or deferred — the buyer needs the reason. Change the status first.' };
  }
  return { ok: true, patch: { client_note: note } };
}
