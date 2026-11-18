import type { UpgradeTotalsPricing } from '../../src/lib/upgradeTotals';

interface ConfigRow { config_key: string; config_value: number | string; is_active: boolean }
interface MaterialRow { material_key: string; cost_per_unit: number | string; is_active: boolean }
interface AreaRow {
  unit_type_code: string; all_lvp: number; main_living: number; second_bedroom: number; master_bedroom_lvp: number;
  master_bedroom: number; second_bedroom_carpet: number; guest_bathroom: number; master_ensuite: number;
  laundry: number; backsplash: number;
}
export interface PricingSnapshot {
  pricing_config: ConfigRow[];
  upgrade_materials: MaterialRow[];
  unit_area_data: AreaRow[];
}

// Mirrors loadSavedSubmissionContext (src/lib/savedSubmissionPdf.ts) but reads from a JSON snapshot.
export function loadFixturePricing(snapshot: PricingSnapshot): UpgradeTotalsPricing {
  const configRows = snapshot.pricing_config;
  const materialRows = snapshot.upgrade_materials.filter(m => m.is_active);
  const areaRows = snapshot.unit_area_data;
  const fee = (key: string) => {
    const row = configRows.find(c => c.config_key === key);
    if (!row) throw new Error(`Missing pricing setting: ${key}`);
    return row.is_active ? Number(row.config_value) : 0;
  };
  return {
    markupPercentage: fee('markup_percentage') / 100, gstRate: fee('gst_rate') / 100,
    getMaterialCost: key => Number(materialRows.find(m => m.material_key === key)?.cost_per_unit || 0),
    getGroutColorFee: () => fee('grout_color_change_price'),
    getAdditionalWindowPrice: () => fee('additional_window_price'),
    getPatioDoorPrice: () => fee('patio_door_price'),
    getAutomatedMotorPrice: () => fee('automated_motor_price'),
    getHeatedFloorPrice: () => fee('heated_floor_per_bathroom'),
    getStairLvpUpgradePrice: () => fee('stair_lvp_upgrade_price'),
    getStairPremiumLvpUpgradePrice: () => fee('stair_premium_lvp_upgrade_price'),
    getStairCarpetUpgradePrice: () => fee('premium_carpet_stairs_price'),
    getStairUnderpadUpgradePrice: () => fee('premium_underpad_stairs_price'),
    getUnitAreaData: code => {
      const row = areaRows.find(a => a.unit_type_code.toUpperCase() === code.toUpperCase());
      if (!row) return null;
      return { allLvp: Number(row.all_lvp), mainLiving: Number(row.main_living), secondBedroom: Number(row.second_bedroom),
        masterBedroomLvp: Number(row.master_bedroom_lvp), masterBedroom: Number(row.master_bedroom),
        secondBedroomCarpet: Number(row.second_bedroom_carpet), guestBathroom: Number(row.guest_bathroom),
        masterEnsuite: Number(row.master_ensuite), laundry: Number(row.laundry), backsplash: Number(row.backsplash) };
    },
  };
}
