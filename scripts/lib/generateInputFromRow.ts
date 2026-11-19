// One mapping from a `buyer_selections` row to (a) both engines' inputs (the oracle, test/backfill only) and (b)
// `GenerateInput` for generateQuoteLines. (b) lives in src/lib/generateInputFromSelections.ts (shared with the wizard
// and, via _shared/quoteSelectionsFromRow.ts, with send-selections-email) and is re-exported here.
// scripts/quote-lines-parity.test.ts proves this mapping on the 9 live units, and scripts/backfill-quote-lines.ts uses
// the same functions, so the backfill cannot drift from what was proven.
import { loadFixturePricing, type PricingSnapshot } from './fixturePricing';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '../../src/lib/upgradeTotals';
import {
  computeUpgradeTotalsServer, type ServerAreaUpgrade, type ServerPricing,
} from '../../supabase/functions/_shared/upgradeTotalsServer';
import { serverPricingFromRows } from '../../supabase/functions/_shared/loadServerPricing';
import { totalsInputFromSelections } from '../../src/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '../../src/lib/buyerPdfSelections';
import { buildGenerateInputFromRow, unitTypeCodeOf } from '../../src/lib/generateInputFromSelections';

export { buildGenerateInputFromRow, unitTypeCodeOf };

export type SubmissionRow = Parameters<typeof toBuyerPdfSelections>[0];

export interface EnginePricing { clientPricing: UpgradeTotalsPricing; serverPricing: ServerPricing }

/**
 * Both engines' pricing from the raw pricing rows. The client side mirrors loadSavedSubmissionContext (inactive
 * config fees read as 0, inactive materials dropped); the server side reads the rows the edge loader reads
 * (restPricingFetcher: all pricing_config rows, upgrade_materials filtered to is_active).
 */
export function enginePricingFromRows(rows: PricingSnapshot): EnginePricing {
  return {
    clientPricing: loadFixturePricing(rows),
    serverPricing: serverPricingFromRows({
      pricing_config: rows.pricing_config,
      upgrade_materials: rows.upgrade_materials.filter((m) => m.is_active),
      unit_area_data: rows.unit_area_data,
    }),
  };
}

/** Raw row → ServerTotalsInput: the same mapping as audit-pricing-consistency / qbo-sync-submission. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serverTotalsInputFromRow(row: SubmissionRow): Parameters<typeof computeUpgradeTotalsServer>[0] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = row as any;
  return {
    unitTypeCode: unitTypeCodeOf(row),
    upgradeFloorSelection: sub.upgrade_floor_selection,
    areaUpgrades: (sub.area_upgrades as ServerAreaUpgrade[]) || [],
    backsplashGroutEnabled: sub.backsplash_grout_enabled,
    backsplashGroutColor: sub.backsplash_grout_color,
    stairLvpUpgradeSelected: sub.stair_lvp_upgrade_selected,
    stairPremiumCarpetSelected: sub.stair_premium_carpet_selected, stairPremiumUnderpadSelected: sub.premium_underpad_stairs,
    stairUpgradeType: sub.stair_upgrade_type,
    additionalWindowsQty: sub.additional_windows_qty,
    patioDoorsQty: sub.patio_doors_qty,
    automatedWindowsQty: sub.automated_windows_qty,
    bathroomTileSelected: sub.bathroom_tile_selected,
    bathroomTileEnsuiteSelected: sub.bathroom_tile_ensuite_selected,
    bathroomTileGuestSelected: sub.bathroom_tile_guest_selected,
    heatedFloorBathrooms: sub.heated_floor_bathrooms,
    customTiledShower: sub.custom_tiled_shower,
    bedroomFlooringChoice: sub.bedroom_flooring_choice,
    bedroomPremiumCarpetSelected: !!sub.premium_carpet_bedroom,
    bedroomPremiumUnderpadSelected: !!sub.premium_underpad_bedroom,
    customPricing: sub.custom_pricing,
  };
}

/** Both Phase 1 engines (the oracle) for one row. */
export function engineTotalsForRow(row: SubmissionRow, pricing: EnginePricing) {
  const selections = toBuyerPdfSelections(row);
  const client = computeUpgradeTotals(totalsInputFromSelections(selections, unitTypeCodeOf(row)), pricing.clientPricing);
  const server = computeUpgradeTotalsServer(serverTotalsInputFromRow(row), pricing.serverPricing);
  return { client, server };
}
