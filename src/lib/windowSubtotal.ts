import type { Tables } from '@/integrations/supabase/types';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '@/lib/upgradeTotals';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import { totalsInputFromSelections } from '@/lib/buyerPdfGenerator';

/**
 * Window-coverings figure for a saved submission: the engine's pre-GST `windowSubtotal` at current prices.
 * Never read the submit-time total column on buyer_selections — it is written once at submit (GST-inclusive, that day's
 * prices) and the editor never updates it.
 */
export function windowSubtotalForRow(row: Tables<'buyer_selections'>, pricing: UpgradeTotalsPricing): number {
  const input = totalsInputFromSelections(toBuyerPdfSelections(row), normalizeUnitTypeCode(row.unit_type));
  return computeUpgradeTotals(input, pricing).windowSubtotal;
}
