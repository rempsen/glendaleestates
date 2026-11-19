// The meeting console's single allowed arithmetic (Phase 2 Task 8): a line's amount is qty × unit price when both
// are known; otherwise it is whatever staff typed. Totals are never computed here — RunningTotal / sumQuoteLines own them.

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Float-noise normalisation to 1e-6, NOT cent rounding — the same rule as generateQuoteLines, so an office line and
 * a generated line with the same inputs carry the same amount (44 × 9.6 = 422.40000000000003 → 422.4).
 */
const PRECISION = 1e6;
const norm = (x: number): number => Math.round(x * PRECISION) / PRECISION;

/** qty × unitPrice when both are finite numbers; else the typed amount (finite) or null ("Pending", never $0). */
export function lineAmount(
  quantity: number | null | undefined,
  unitPrice: number | null | undefined,
  manualAmount: number | null | undefined,
): number | null {
  if (known(quantity) && known(unitPrice)) return norm(quantity * unitPrice);
  return known(manualAmount) ? manualAmount : null;
}
