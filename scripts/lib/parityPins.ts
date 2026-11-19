// Pre-GST subtotal per live unit (scripts/fixtures/live-submissions.json at scripts/fixtures/pricing-snapshot.json).
// Captured from the Phase 1 engines on 2026-11-18 and carried unchanged, to the cent, onto the quote-line generator
// when the engines were deleted (Phase 2 Task 18). A change here is a pricing change: it needs Dan's sign-off.
export const PINNED_SUBTOTALS: Readonly<Record<string, number>> = {
  '2': 2460,
  '4': 14334,
  '7': 3296.7, // 2026-11-18: +451.20 premium underpad (flag was never priced); reported to Dan, no override written
  '24': 10388.4,
  '27': 0,
  // Engine subtotal 27,263.00 vs. the staff note of 2026-11-16 "$27,204.50 plus GST" (gap $58.50, origin unknown).
  '31': 27263,
  '37': 10488.5,
  '38': 2680.5,
  '43': 23865,
};
