import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  UPGRADE_COSTS as DEFAULT_UPGRADE_COSTS,
  MARKUP_PERCENTAGE as DEFAULT_MARKUP,
  GST_RATE as DEFAULT_GST,
  UNIT_AREA_DATA,
  UPGRADE_MATERIALS as DEFAULT_MATERIALS,
  AREA_DEFINITIONS,
  UpgradeArea,
  AreaUpgradeSelection,
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

interface PricingState {
  materials: DatabaseMaterial[];
  config: DatabaseConfig[];
  loaded: boolean;
  error: string | null;
}

// Global cache to avoid refetching on every component mount
let globalPricingCache: PricingState | null = null;
let globalCachePromise: Promise<PricingState> | null = null;

async function fetchPricingData(): Promise<PricingState> {
  try {
    const [materialsRes, configRes] = await Promise.all([
      supabase.from('upgrade_materials').select('*').eq('is_active', true).order('display_order'),
      supabase.from('pricing_config').select('*'),
    ]);

    if (materialsRes.error) throw materialsRes.error;
    if (configRes.error) throw configRes.error;

    return {
      materials: materialsRes.data as DatabaseMaterial[],
      config: configRes.data as DatabaseConfig[],
      loaded: true,
      error: null,
    };
  } catch (error) {
    console.error('Error fetching pricing data:', error);
    return {
      materials: [],
      config: [],
      loaded: true,
      error: error instanceof Error ? error.message : 'Failed to load pricing',
    };
  }
}

export function useDynamicPricing() {
  const [state, setState] = useState<PricingState>(() => globalPricingCache || {
    materials: [],
    config: [],
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

  // Check if a flat-rate pricing item is enabled
  const isFlatRateEnabled = useCallback((configKey: string): boolean => {
    const config = state.config.find(c => c.config_key === configKey);
    return config ? config.is_active !== false : true;
  }, [state.config]);

  // Get material cost from DB or fallback to defaults
  const getMaterialCost = useCallback((materialType: 'lvp' | 'hardwood' | 'carpet' | 'tile'): number => {
    const dbMaterial = state.materials.find(m => m.material_key === materialType);
    if (dbMaterial) {
      return dbMaterial.cost_per_unit;
    }
    // Fallback to hardcoded defaults
    const defaultMap: Record<string, number> = {
      lvp: DEFAULT_UPGRADE_COSTS.lvpUpgrade,
      hardwood: DEFAULT_UPGRADE_COSTS.hardwoodUpgrade,
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
  const getMaterialInfo = useCallback((materialType: 'lvp' | 'hardwood' | 'carpet' | 'tile') => {
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
        id: m.material_key as 'lvp' | 'hardwood' | 'carpet' | 'tile',
        name: m.name,
        description: m.description || '',
        costPerUnit: m.cost_per_unit,
        unit: m.unit_type,
      }));
    }
    return DEFAULT_MATERIALS;
  }, [state.materials]);

  // Calculate price for a single area upgrade
  const calculateAreaUpgradePrice = useCallback((
    unitTypeCode: string,
    areaId: UpgradeArea,
    materialType: 'lvp' | 'hardwood' | 'carpet' | 'tile'
  ): { baseCost: number; markedUpCost: number; gst: number; total: number; quantity: number; unit: string } => {
    const unitData = UNIT_AREA_DATA[unitTypeCode];
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
  }, [getMaterialCost, getMaterialInfo, markupPercentage, gstRate]);

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
    isFlatRateEnabled,
    calculateAreaUpgradePrice,
    calculateBacksplashGroutPrice,
    calculateTotalUpgradeCost,
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

  const getMaterialCost = (materialType: 'lvp' | 'hardwood' | 'carpet' | 'tile'): number => {
    const dbMaterial = materials.find(m => m.material_key === materialType);
    if (dbMaterial) return dbMaterial.cost_per_unit;
    const defaultMap: Record<string, number> = {
      lvp: DEFAULT_UPGRADE_COSTS.lvpUpgrade,
      hardwood: DEFAULT_UPGRADE_COSTS.hardwoodUpgrade,
      carpet: DEFAULT_UPGRADE_COSTS.carpetUpgrade,
      tile: DEFAULT_UPGRADE_COSTS.tileUpgrade,
    };
    return defaultMap[materialType] || 0;
  };

  return { markupPercentage, gstRate, getMaterialCost };
}
