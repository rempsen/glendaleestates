// Phase 1 engine inputs, moved out of buyerPdfGenerator.ts in Phase 2 Task 10 (the PDF and Word renderers now read
// quote lines and no longer call the engine). Still used by the engine's remaining callers (custom pricing panel,
// window subtotal hook, parity harness, backfill) until Task 18 deletes the engines; buyerPdfGenerator re-exports both.
import type { MaterialType } from '@/lib/upgradeCostData';
import type { BuyerSelections } from '@/lib/buyerPdfGenerator';

// Unit area data structure (camelCase for internal use)
export interface UnitAreaDataForPdf {
  allLvp: number;
  mainLiving: number;
  secondBedroom: number;
  masterBedroomLvp: number;
  masterBedroom: number;
  secondBedroomCarpet: number;
  guestBathroom: number;
  masterEnsuite: number;
  laundry: number;
  backsplash: number;
  [key: string]: number | undefined;
}

// Pricing config interface for dynamic pricing
export interface PdfPricingConfig {
  markupPercentage: number;
  gstRate: number;
  getMaterialCost: (materialType: MaterialType) => number;
  getGroutColorFee: () => number;
  getAdditionalWindowPrice: () => number;
  getPatioDoorPrice: () => number;
  getAutomatedMotorPrice: () => number;
  getHeatedFloorPrice: () => number;
  getStairLvpUpgradePrice?: () => number;
  getStairPremiumLvpUpgradePrice?: () => number;
  getStairCarpetUpgradePrice?: () => number;
  getStairUnderpadUpgradePrice?: () => number;
  getUnitAreaData?: (unitTypeCode: string) => UnitAreaDataForPdf | null;
}

/** BuyerSelections → the engine's totals input (computeUpgradeTotals). */
export function totalsInputFromSelections(selections: BuyerSelections, unitTypeCode: string | null) {
  return {
    unitTypeCode,
    upgradeFloorSelection: selections.upgradeFloorSelection,
    areaUpgrades: selections.areaUpgrades || [],
    backsplashGrout: selections.backsplashGrout,
    stairLvpUpgradeSelected: selections.stairLvpUpgradeSelected,
    stairUpgradeType: selections.stairUpgradeType,
    stairPremiumCarpetSelected: selections.stairPremiumCarpetSelected,
    stairPremiumUnderpadSelected: selections.premiumUnderpadStairs,
    bedroomFlooringChoice: selections.bedroomFlooringChoice,
    bedroomPremiumCarpetSelected: selections.premiumCarpetBedroom,
    bedroomPremiumUnderpadSelected: selections.premiumUnderpadBedroom,
    additionalWindowsQty: selections.additionalWindowsQty,
    patioDoorsQty: selections.patioDoorsQty,
    automatedWindowsQty: selections.automatedWindowsQty,
    bathroomTileSelected: selections.bathroomTileSelected,
    bathroomTileEnsuiteSelected: selections.bathroomTileEnsuiteSelected,
    bathroomTileGuestSelected: selections.bathroomTileGuestSelected,
    heatedFloorBathrooms: selections.heatedFloorBathrooms,
    customTiledShower: selections.customTiledShower,
    customPricing: selections.customPricing,
    };
}
