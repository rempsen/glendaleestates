// The meeting console's single allowed arithmetic (Phase 2 Task 8): a line's amount is qty × unit price when both
// are known; otherwise it is whatever staff typed. Totals are never computed here — RunningTotal / sumQuoteLines own them.

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Float-noise normalisation to 1e-6 (44 × 9.6 = 422.40000000000003 → 422.4), applied before the cent rounding. */
const PRECISION = 1e6;
const norm = (x: number): number => Math.round(x * PRECISION) / PRECISION;

/**
 * Cents at write (final fix wave I4): QuickBooks stores line amounts to the cent, so a sub-cent office amount would make
 * Σ line Amount differ from the quote subtotal. Half-up on the normalised cents (1.005 → 1.01, not 1.00). The generator
 * yields no sub-cent amount on the nine live units (scripts/line-amount.test.ts), so generated and office lines with
 * the same inputs still carry the same amount.
 */
const cents = (x: number): number => Math.round(norm(x * 100)) / 100;

/** qty × unitPrice when both are finite numbers; else the typed amount (finite) or null ("Pending", never $0). */
export function lineAmount(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  manualAmount: number | null | undefined,
): number | null {
  if (known(quantity) && known(unitPrice)) return cents(quantity * unitPrice);
  return known(manualAmount) ? cents(manualAmount) : null;
}
