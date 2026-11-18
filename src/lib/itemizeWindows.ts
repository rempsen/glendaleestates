import type { BuyerSelections } from './buyerPdfGenerator';
import type { CustomLineItem, UpgradeTotalsPricing } from './upgradeTotals';

export interface WindowLocations {
  additional: string[];
  patio: string[];
  motorized: string[];
  includedBedrooms: { label: string; qty: number }[];
}

/** Quantity fields on the editor state (snake_case), zeroed once the windows are itemized. */
export interface WindowQtyPatch {
  additional_windows_qty?: 0;
  patio_doors_qty?: 0;
  automated_windows_qty?: 0;
}

const newId = (i: number) => `win-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Replaces the three integer window quantities with one located custom line per window/door, priced from the
 * live pricing config. Idempotent: when all quantities are already 0 there is nothing to convert and the result
 * is empty (no patch, no lines), so a second run never double-charges.
 */
export function itemizeWindows(
  selections: BuyerSelections,
  pricing: UpgradeTotalsPricing,
  locations: WindowLocations,
): { patch: WindowQtyPatch; customItems: CustomLineItem[] } {
  const hasQty = (selections.additionalWindowsQty || 0) > 0 || (selections.patioDoorsQty || 0) > 0 || (selections.automatedWindowsQty || 0) > 0;
  if (!hasQty) return { patch: {}, customItems: [] };

  let n = 0;
  const line = (label: string, unitPrice: number, status: 'upgrade' | 'included'): CustomLineItem =>
    ({ id: newId(n++), label, quantity: 1, unit: 'each', unitPrice, status });
  const clean = (xs: string[]) => xs.map(x => x.trim()).filter(Boolean);

  const customItems: CustomLineItem[] = [
    ...clean(locations.additional).map(l => line(`Roller shade, 5% openness — ${l}`, pricing.getAdditionalWindowPrice(), 'upgrade')),
    ...clean(locations.patio).map(l => line(`Patio door panel track — ${l}`, pricing.getPatioDoorPrice(), 'upgrade')),
    ...clean(locations.motorized).map(l => line(`Somfy motorization — ${l}`, pricing.getAutomatedMotorPrice(), 'upgrade')),
  ];
  for (const b of locations.includedBedrooms) {
    const label = b.label.trim();
    if (label && b.qty > 0) customItems.push(line(`Blackout roller shade — ${label}`, 0, 'included'));
  }
  return { patch: { additional_windows_qty: 0, patio_doors_qty: 0, automated_windows_qty: 0 }, customItems };
}
