// One mapping from a `buyer_selections` row to `GenerateInput` for generateQuoteLines. It lives in
// src/lib/generateInputFromSelections.ts (shared with the wizard and, via _shared/quoteSelectionsFromRow.ts, with the
// edge functions) and is re-exported here for the tests and scripts/backfill-quote-lines.ts.
import { serverPricingFromRows } from '../../supabase/functions/_shared/loadServerPricing';
import { generateQuoteLines, sumQuoteLines, type QuotePricing } from '../../supabase/functions/_shared/quoteLines';
import { toBuyerPdfSelections } from '../../src/lib/buyerPdfSelections';
import { buildGenerateInputFromRow, unitTypeCodeOf } from '../../src/lib/generateInputFromSelections';
import type { PricingSnapshot } from './fixturePricing';
import { PINNED_SUBTOTALS } from './parityPins';

export { buildGenerateInputFromRow, unitTypeCodeOf };

export type SubmissionRow = Parameters<typeof toBuyerPdfSelections>[0];

/** Generator pricing from raw pricing rows (inactive rows dropped, as every live loader does). */
export function pricingFromRows(rows: PricingSnapshot): QuotePricing {
  return serverPricingFromRows({
    pricing_config: rows.pricing_config,
    upgrade_materials: rows.upgrade_materials,
    unit_area_data: rows.unit_area_data,
  });
}

/** The lines the generator produces for a row, and their totals (sumQuoteLines). */
export function generatedTotalsForRow(row: SubmissionRow, pricing: QuotePricing) {
  const lines = generateQuoteLines(buildGenerateInputFromRow(row, pricing));
  return { lines, totals: sumQuoteLines(lines, pricing.gstRate) };
}

/**
 * Reference totals a renderer must reproduce for a fixture row: `grandSubtotal` is the parity pin (the Phase 1
 * engines' value, scripts/lib/parityPins.ts); the section split, GST and total are sumQuoteLines over the generated
 * lines. Field names follow the old engine result so the renderer tests read the same before and after Task 18.
 */
export function referenceTotalsForRow(row: SubmissionRow, pricing: QuotePricing) {
  const { totals } = generatedTotalsForRow(row, pricing);
  const pin = PINNED_SUBTOTALS[String(row.unit_number)];
  return {
    grandSubtotal: pin ?? totals.subtotal,
    windowSubtotal: totals.windowCoverings,
    upgradesSubtotal: totals.upgrades,
    gst: totals.gst,
    grandTotal: totals.total,
  };
}
