import type { Tables } from '@/integrations/supabase/types';
import { AREA_DEFINITIONS } from '@/lib/upgradeCostData';
import { computeUpgradeTotals } from '@/lib/upgradeTotals';
import { buildStandardSelectionRows, totalsInputFromSelections, type PdfPricingConfig } from '@/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import { toBuyerWording } from '@/lib/outputLabels';

/**
 * Selections table rows for the Word export (label/value pairs, no docx dependency so they are testable).
 * Same wording and option-name resolution as the buyer PDF; area upgrade rows use buyer-facing area names.
 */
export function buildWordSelectionRows(
  s: Tables<'buyer_selections'>,
  pricing: PdfPricingConfig,
  unitCode: string | null,
): string[][] {
  const sel = toBuyerPdfSelections(s);
  const totals = computeUpgradeTotals(totalsInputFromSelections(sel, unitCode), pricing);
  const rows = buildStandardSelectionRows(sel, pricing, totals);
  (sel.areaUpgrades || []).forEach(u => {
    const areaName = toBuyerWording(AREA_DEFINITIONS.find(a => a.id === u.areaId)?.name || u.areaId);
    rows.push([`Upgrade — ${areaName}`, [u.productName, u.productColor, u.clientComment?.trim()].filter(Boolean).join(' — ')]);
  });
  return rows;
}
