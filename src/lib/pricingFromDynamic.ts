import type { UpgradeTotalsPricing } from './upgradeTotals';

/** The subset of `useDynamicPricing()` the totals engine needs. */
export interface DynamicPricingSource {
  markupPercentage: number;
  gstRate: number;
  getMaterialCost: (m: any) => number;
  getGroutColorFee: () => number;
  getAdditionalWindowPrice: () => number;
  getPatioDoorPrice: () => number;
  getAutomatedMotorPrice: () => number;
  getHeatedFloorPrice: () => number;
  getStairLvpUpgradePrice: () => number;
  getStairPremiumLvpUpgradePrice: () => number;
  getStairCarpetUpgradePrice: () => number;
  getUnderpadStairsPrice: () => number;
  getUnitAreaData: (code: string) => any;
}

/** Adapts the dynamic-pricing hook to the shape `computeUpgradeTotals` expects (underpad name differs). */
export function pricingFromDynamic(dyn: DynamicPricingSource): UpgradeTotalsPricing {
  return {
    markupPercentage: dyn.markupPercentage,
    gstRate: dyn.gstRate,
    getMaterialCost: dyn.getMaterialCost,
    getGroutColorFee: dyn.getGroutColorFee,
    getAdditionalWindowPrice: dyn.getAdditionalWindowPrice,
    getPatioDoorPrice: dyn.getPatioDoorPrice,
    getAutomatedMotorPrice: dyn.getAutomatedMotorPrice,
    getHeatedFloorPrice: dyn.getHeatedFloorPrice,
    getStairLvpUpgradePrice: dyn.getStairLvpUpgradePrice,
    getStairPremiumLvpUpgradePrice: dyn.getStairPremiumLvpUpgradePrice,
    getStairCarpetUpgradePrice: dyn.getStairCarpetUpgradePrice,
    getStairUnderpadUpgradePrice: dyn.getUnderpadStairsPrice,
    getUnitAreaData: dyn.getUnitAreaData,
  };
}
