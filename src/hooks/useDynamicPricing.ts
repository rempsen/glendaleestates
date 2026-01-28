import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  UPGRADE_COSTS as DEFAULT_UPGRADE_COSTS,
  MARKUP_PERCENTAGE as DEFAULT_MARKUP,
  GST_RATE as DEFAULT_GST,
  UNIT_AREA_DATA as FALLBACK_UNIT_AREA_DATA,
  UPGRADE_MATERIALS as DEFAULT_MATERIALS,
  AREA_DEFINITIONS,
  UpgradeArea,
  AreaUpgradeSelection,
  MaterialType,
} from '@/lib/upgradeCostData';

interface DatabaseMaterial {
  id: string;
  material_key: string;
  name: string;
  description: string | null;
  cost_per_unit: number;
  unit_type: 'sqft' | 'sqyd' | 'flat';
  is_active: boolean;
  display_order: number;
  parent_material_key: string | null;
}

interface DatabaseConfig {
  id: string;
  config_key: string;
  config_value: number;
  is_percentage: boolean;
  is_active: boolean;
}

interface DatabaseUnitArea {
  id: string;
  unit_type_code: string;
  unit_type_label: string;
  all_lvp: number;
  main_living: number;
  second_bedroom: number;
  master_bedroom: number;
  second_bedroom_carpet: number;
  guest_bathroom: number;
  master_ensuite: number;
  laundry: number;
  backsplash: number;
  display_order: number;
}

interface PricingState {
  materials: DatabaseMaterial[];
  config: DatabaseConfig[];
  unitAreas: DatabaseUnitArea[];
  loaded: boolean;
  error: string | null;
}

// Global cache to avoid refetching on every component mount
let globalPricingCache: PricingState | null = null;
let globalCachePromise: Promise<PricingState> | null = null;

async function fetchPricingData(): Promise<PricingState> {
  try {
    const [materialsRes, configRes, unitAreasRes] = await Promise.all([
      supabase.from('upgrade_materials').select('*').eq('is_active', true).order('display_order'),
      supabase.from('pricing_config').select('*'),
      supabase.from('unit_area_data').select('*').order('display_order'),
    ]);

    if (materialsRes.error) throw materialsRes.error;
    if (configRes.error) throw configRes.error;
    // Unit area fetch failure is non-fatal - we'll use fallback data
    if (unitAreasRes.error) {
      console.warn('Failed to fetch unit area data, using defaults:', unitAreasRes.error);
    }

    return {
      materials: materialsRes.data as DatabaseMaterial[],
      config: configRes.data as DatabaseConfig[],
      unitAreas: (unitAreasRes.data as DatabaseUnitArea[]) || [],
      loaded: true,
      error: null,
    };
  } catch (error) {
    console.error('Error fetching pricing data:', error);
    return {
      materials: [],
      config: [],
      unitAreas: [],
      loaded: true,
      error: error instanceof Error ? error.message : 'Failed to load pricing',
    };
  }
}

export function useDynamicPricing() {
  const [state, setState] = useState<PricingState>(() => globalPricingCache || {
    materials: [],
    config: [],
    unitAreas: [],
    loaded: false,
    error: null,
  });

  useEffect(() => {
    if (globalPricingCache) {
      setState(globalPricingCache);
      return;
    }

    if (!globalCachePromise) {
      globalCachePromise = fetchPricingData();
    }

    globalCachePromise.then((data) => {
      globalPricingCache = data;
      setState(data);
    });
  }, []);

  // Get markup percentage (from DB or default)
  const markupPercentage = useMemo(() => {
    const config = state.config.find(c => c.config_key === 'markup_percentage');
    return config ? config.config_value / 100 : DEFAULT_MARKUP;
  }, [state.config]);

  // Get GST rate (from DB or default)
  const gstRate = useMemo(() => {
    const config = state.config.find(c => c.config_key === 'gst_rate');
    return config ? config.config_value / 100 : DEFAULT_GST;
  }, [state.config]);

  // Get flat-rate pricing values (returns 0 if disabled)
  const getAdditionalWindowPrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'additional_window_price');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  const getPatioDoorPrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'patio_door_price');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  const getAutomatedMotorPrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'automated_motor_price');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  const getHeatedFloorPrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'heated_floor_per_bathroom');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  const getGroutColorChangePrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'grout_color_change_price');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  const getStairLvpUpgradePrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'stair_lvp_upgrade_price');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  const getStairCarpetUpgradePrice = useCallback((): number => {
    const config = state.config.find(c => c.config_key === 'premium_carpet_stairs_price');
    if (!config || config.is_active === false) return 0;
    return config.config_value;
  }, [state.config]);

  // Check if a flat-rate pricing item is enabled
  const isFlatRateEnabled = useCallback((configKey: string): boolean => {
    const config = state.config.find(c => c.config_key === configKey);
    return config ? config.is_active !== false : true;
  }, [state.config]);

  // Get material cost from DB or fallback to defaults
  const getMaterialCost = useCallback((materialType: MaterialType): number => {
    const dbMaterial = state.materials.find(m => m.material_key === materialType);
    if (dbMaterial) {
      return dbMaterial.cost_per_unit;
    }
    // Fallback to hardcoded defaults (lvt uses same pricing as lvp)
    const defaultMap: Record<string, number> = {
      lvp: DEFAULT_UPGRADE_COSTS.lvpUpgrade,
      hardwood: DEFAULT_UPGRADE_COSTS.hardwoodUpgrade,
      lvt: DEFAULT_UPGRADE_COSTS.lvpUpgrade,
      carpet: DEFAULT_UPGRADE_COSTS.carpetUpgrade,
      tile: DEFAULT_UPGRADE_COSTS.tileUpgrade,
    };
    return defaultMap[materialType] || 0;
  }, [state.materials]);

  // Get grout color flat fee (uses the new config)
  const getGroutColorFee = useCallback((): number => {
    return getGroutColorChangePrice();
  }, [getGroutColorChangePrice]);

  // Get material info for display
  const getMaterialInfo = useCallback((materialType: MaterialType) => {
    const dbMaterial = state.materials.find(m => m.material_key === materialType);
    if (dbMaterial) {
      return {
        id: materialType,
        name: dbMaterial.name,
        description: dbMaterial.description || '',
        costPerUnit: dbMaterial.cost_per_unit,
        unit: dbMaterial.unit_type,
      };
    }
    // Fallback to default materials
    return DEFAULT_MATERIALS.find(m => m.id === materialType) || null;
  }, [state.materials]);

  // Get all active materials for a type
  const getActiveMaterials = useCallback(() => {
    if (state.materials.length > 0) {
      return state.materials.map(m => ({
        id: m.material_key as MaterialType,
        name: m.name,
        description: m.description || '',
        costPerUnit: m.cost_per_unit,
        unit: m.unit_type,
      }));
    }
    return DEFAULT_MATERIALS;
  }, [state.materials]);

  // Helper to get unit area data from DB or fallback
  const getUnitAreaData = useCallback((unitTypeCode: string) => {
    // First try to find in database data
    const dbUnit = state.unitAreas.find(u => u.unit_type_code === unitTypeCode);
    if (dbUnit) {
      return {
        allLvp: Number(dbUnit.all_lvp),
        mainLiving: Number(dbUnit.main_living),
        secondBedroom: Number(dbUnit.second_bedroom),
        masterBedroomLvp: Number((dbUnit as any).master_bedroom_lvp || 0),
        masterBedroom: Number(dbUnit.master_bedroom),
        secondBedroomCarpet: Number(dbUnit.second_bedroom_carpet),
        masterBedroomCarpet: 0, // Not in DB yet, use 0
        stairs: 0, // Not in DB yet, use 0
        guestBathroom: Number(dbUnit.guest_bathroom),
        masterEnsuite: Number(dbUnit.master_ensuite),
        laundry: Number(dbUnit.laundry),
        backsplash: Number(dbUnit.backsplash),
      };
    }
    // Fallback to hardcoded defaults
    return FALLBACK_UNIT_AREA_DATA[unitTypeCode] || null;
  }, [state.unitAreas]);

  // Calculate price for a single area upgrade
  const calculateAreaUpgradePrice = useCallback((
    unitTypeCode: string,
    areaId: UpgradeArea,
    materialType: MaterialType
  ): { baseCost: number; markedUpCost: number; gst: number; total: number; quantity: number; unit: string } => {
    const unitData = getUnitAreaData(unitTypeCode);
    if (!unitData) {
      return { baseCost: 0, markedUpCost: 0, gst: 0, total: 0, quantity: 0, unit: 'sq ft' };
    }

    const quantity = unitData[areaId] || 0;
    if (quantity === 0) {
      return { baseCost: 0, markedUpCost: 0, gst: 0, total: 0, quantity: 0, unit: 'sq ft' };
    }

    const costPerUnit = getMaterialCost(materialType);
    const materialInfo = getMaterialInfo(materialType);
    
    const baseCost = quantity * costPerUnit;
    const markedUpCost = baseCost * (1 + markupPercentage);
    const gst = markedUpCost * gstRate;
    const total = markedUpCost + gst;
    const unit = materialInfo?.unit === 'sqyd' ? 'sq yd' : 'sq ft';

    return { baseCost, markedUpCost, gst, total, quantity, unit };
  }, [getUnitAreaData, getMaterialCost, getMaterialInfo, markupPercentage, gstRate]);

  // Calculate backsplash grout color change price
  const calculateBacksplashGroutPrice = useCallback((): { baseCost: number; markedUpCost: number; gst: number; total: number } => {
    const baseCost = getGroutColorFee();
    // Flat fees don't get markup
    const markedUpCost = baseCost;
    const gst = baseCost * gstRate;
    const total = baseCost + gst;
    return { baseCost, markedUpCost, gst, total };
  }, [getGroutColorFee, gstRate]);

  // Calculate total for all selected upgrades
  const calculateTotalUpgradeCost = useCallback((
    unitTypeCode: string,
    selections: AreaUpgradeSelection[]
  ): { subtotal: number; gst: number; total: number; lineItems: Array<{ areaName: string; quantity: number; unit: string; markedUpCost: number }> } => {
    let subtotal = 0;
    const lineItems: Array<{ areaName: string; quantity: number; unit: string; markedUpCost: number }> = [];

    for (const selection of selections) {
      const pricing = calculateAreaUpgradePrice(unitTypeCode, selection.areaId, selection.materialType);
      if (pricing.markedUpCost > 0) {
        subtotal += pricing.markedUpCost;
        const areaInfo = AREA_DEFINITIONS.find(a => a.id === selection.areaId);
        lineItems.push({
          areaName: areaInfo?.name || selection.areaId,
          quantity: pricing.quantity,
          unit: pricing.unit,
          markedUpCost: pricing.markedUpCost,
        });
      }
    }

    const gst = subtotal * gstRate;
    const total = subtotal + gst;

    return { subtotal, gst, total, lineItems };
  }, [calculateAreaUpgradePrice, gstRate]);

  // Force refresh pricing data
  const refreshPricing = useCallback(async () => {
    globalPricingCache = null;
    globalCachePromise = null;
    const data = await fetchPricingData();
    globalPricingCache = data;
    setState(data);
  }, []);

  return {
    loaded: state.loaded,
    error: state.error,
    markupPercentage,
    gstRate,
    getMaterialCost,
    getMaterialInfo,
    getActiveMaterials,
    getGroutColorFee,
    getAdditionalWindowPrice,
    getPatioDoorPrice,
    getAutomatedMotorPrice,
    getHeatedFloorPrice,
    getGroutColorChangePrice,
    getStairLvpUpgradePrice,
    getStairCarpetUpgradePrice,
    isFlatRateEnabled,
    calculateAreaUpgradePrice,
    calculateBacksplashGroutPrice,
    calculateTotalUpgradeCost,
    getUnitAreaData,
    refreshPricing,
  };
}

// Export a simpler version for components that just need calculation functions
// This allows gradual migration without breaking existing code
export function createDynamicCalculators(
  materials: DatabaseMaterial[],
  config: DatabaseConfig[]
) {
  const markupPercentage = (() => {
    const cfg = config.find(c => c.config_key === 'markup_percentage');
    return cfg ? cfg.config_value / 100 : DEFAULT_MARKUP;
  })();

  const gstRate = (() => {
    const cfg = config.find(c => c.config_key === 'gst_rate');
    return cfg ? cfg.config_value / 100 : DEFAULT_GST;
  })();

  const getMaterialCost = (materialType: MaterialType): number => {
    const dbMaterial = materials.find(m => m.material_key === materialType);
    if (dbMaterial) return dbMaterial.cost_per_unit;
    const defaultMap: Record<string, number> = {
      lvp: DEFAULT_UPGRADE_COSTS.lvpUpgrade,
      hardwood: DEFAULT_UPGRADE_COSTS.hardwoodUpgrade,
      lvt: DEFAULT_UPGRADE_COSTS.lvpUpgrade,
      carpet: DEFAULT_UPGRADE_COSTS.carpetUpgrade,
      tile: DEFAULT_UPGRADE_COSTS.tileUpgrade,
    };
    return defaultMap[materialType] || 0;
  };

  return { markupPercentage, gstRate, getMaterialCost };
}
