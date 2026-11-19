// Shape of scripts/fixtures/pricing-snapshot.json (raw pricing_config / upgrade_materials / unit_area_data rows).
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
