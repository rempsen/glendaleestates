// Glendale Estates - Upgrade Cost Data
// Source: GLENDALE_ESTATES_-_UPGRADE_COST_SHEET_1.xlsx
// Pricing is base cost - final customer price = base * (1 + MARKUP_PERCENTAGE) + GST

export const MARKUP_PERCENTAGE = 0.60; // 60% markup
export const GST_RATE = 0.05; // 5% GST

// Upgrade material costs per unit
export const UPGRADE_COSTS = {
  lvpUpgrade: 4.00, // $/sq ft - upgrade from standard LVP to premium
  hardwoodUpgrade: 10.00, // $/sq ft - upgrade from LVP to hardwood
  carpetUpgrade: 20.00, // $/sq yard - upgrade from standard carpet to premium
  tileUpgrade: 8.00, // $/sq ft - upgrade tile (backsplash)
  backsplashGroutColor: 300.00, // flat fee to change backsplash grout color
} as const;

// Unit type labels for display
export const UNIT_TYPE_LABELS: Record<string, string> = {
  'A': 'Unit Type A',
  'B': 'Unit Type B',
  'C': 'Unit Type C',
  'D': 'Unit Type D',
  'E': 'Unit Type E',
  'F': 'Unit Type F',
  'G-1': 'Unit Type G - 1st Floor',
  'G-2': 'Unit Type G - 2nd Floor',
  'H-1': 'Unit Type H - 1st Floor',
  'H-2': 'Unit Type H - 2nd Floor',
  'J': 'Unit Type J',
};

// Area definitions for each upgrade zone
export type UpgradeArea = 
  | 'mainLiving'
  | 'secondBedroom'
  | 'masterBedroom'
  | 'secondBedroomCarpet' // sq yards
  | 'guestBathroom'
  | 'masterEnsuite'
  | 'laundry'
  | 'backsplash'
  | 'allLvp'; // entire unit LVP

export interface AreaInfo {
  id: UpgradeArea;
  name: string;
  description: string;
  unit: 'sqft' | 'sqyd';
  upgradeTypes: ('lvp' | 'hardwood' | 'carpet' | 'tile')[];
  icon: string; // Lucide icon name
}

export const AREA_DEFINITIONS: AreaInfo[] = [
  {
    id: 'mainLiving',
    name: 'Main Living Area',
    description: 'Living room, dining room, and kitchen flooring',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'tile'],
    icon: 'Sofa',
  },
  {
    id: 'secondBedroom',
    name: 'Second Bedroom',
    description: 'Guest bedroom or office area flooring',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'tile'],
    icon: 'BedDouble',
  },
  {
    id: 'masterBedroom',
    name: 'Master Bedroom',
    description: 'Primary bedroom flooring',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'tile'],
    icon: 'Bed',
  },
  {
    id: 'secondBedroomCarpet',
    name: 'Second Bedroom Carpet',
    description: 'Upgrade carpet in the second bedroom',
    unit: 'sqyd',
    upgradeTypes: ['carpet'],
    icon: 'Grid3x3',
  },
  {
    id: 'guestBathroom',
    name: 'Guest Bathroom',
    description: 'Secondary bathroom flooring',
    unit: 'sqft',
    upgradeTypes: ['tile', 'lvp'],
    icon: 'Bath',
  },
  {
    id: 'masterEnsuite',
    name: 'Master Ensuite',
    description: 'Primary bathroom flooring',
    unit: 'sqft',
    upgradeTypes: ['tile', 'lvp'],
    icon: 'ShowerHead',
  },
  {
    id: 'laundry',
    name: 'Laundry Room',
    description: 'Laundry room flooring',
    unit: 'sqft',
    upgradeTypes: ['tile', 'lvp'],
    icon: 'WashingMachine',
  },
  {
    id: 'backsplash',
    name: 'Kitchen Backsplash',
    description: 'Tile backsplash in kitchen',
    unit: 'sqft',
    upgradeTypes: ['tile'],
    icon: 'LayoutGrid',
  },
  {
    id: 'allLvp',
    name: 'Entire Unit LVP',
    description: 'All LVP flooring throughout the unit',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'tile'],
    icon: 'Home',
  },
];

// Square footage/yardage by unit type and area
// Values from the cost sheet
export interface UnitAreaData {
  allLvp: number;
  mainLiving: number;
  secondBedroom: number;
  masterBedroom: number;
  secondBedroomCarpet: number; // in sq yards
  guestBathroom: number;
  masterEnsuite: number;
  laundry: number;
  backsplash: number;
}

export const UNIT_AREA_DATA: Record<string, UnitAreaData> = {
  'A': {
    allLvp: 1350,
    mainLiving: 250,
    secondBedroom: 200,
    masterBedroom: 90,
    secondBedroomCarpet: 20, // sq yards
    guestBathroom: 165,
    masterEnsuite: 80,
    laundry: 0, // included in LVP or closet
    backsplash: 30,
  },
  'B': {
    allLvp: 1150,
    mainLiving: 250,
    secondBedroom: 180,
    masterBedroom: 28,
    secondBedroomCarpet: 20,
    guestBathroom: 135,
    masterEnsuite: 75,
    laundry: 0,
    backsplash: 25,
  },
  'C': {
    allLvp: 1500,
    mainLiving: 360,
    secondBedroom: 200,
    masterBedroom: 44,
    secondBedroomCarpet: 24,
    guestBathroom: 200,
    masterEnsuite: 80,
    laundry: 60,
    backsplash: 25,
  },
  'D': {
    allLvp: 1500,
    mainLiving: 360,
    secondBedroom: 200,
    masterBedroom: 44,
    secondBedroomCarpet: 24,
    guestBathroom: 200,
    masterEnsuite: 80,
    laundry: 60,
    backsplash: 25,
  },
  'E': {
    allLvp: 1050,
    mainLiving: 200,
    secondBedroom: 180,
    masterBedroom: 24,
    secondBedroomCarpet: 22,
    guestBathroom: 150,
    masterEnsuite: 60,
    laundry: 40,
    backsplash: 25,
  },
  'F': {
    allLvp: 1050,
    mainLiving: 200,
    secondBedroom: 180,
    masterBedroom: 24,
    secondBedroomCarpet: 22,
    guestBathroom: 150,
    masterEnsuite: 60,
    laundry: 40,
    backsplash: 25,
  },
  'G-1': {
    allLvp: 700,
    mainLiving: 0, // 1st floor layout different
    secondBedroom: 0,
    masterBedroom: 0,
    secondBedroomCarpet: 0,
    guestBathroom: 200,
    masterEnsuite: 50,
    laundry: 50,
    backsplash: 25,
  },
  'G-2': {
    allLvp: 900,
    mainLiving: 0,
    secondBedroom: 0,
    masterBedroom: 120, // carpet shown
    secondBedroomCarpet: 0,
    guestBathroom: 0,
    masterEnsuite: 50,
    laundry: 0,
    backsplash: 0,
  },
  'H-1': {
    allLvp: 600,
    mainLiving: 0,
    secondBedroom: 0,
    masterBedroom: 0,
    secondBedroomCarpet: 0,
    guestBathroom: 190,
    masterEnsuite: 50,
    laundry: 40,
    backsplash: 25,
  },
  'H-2': {
    allLvp: 675,
    mainLiving: 0,
    secondBedroom: 0,
    masterBedroom: 90, // carpet shown
    secondBedroomCarpet: 0,
    guestBathroom: 0,
    masterEnsuite: 50,
    laundry: 0,
    backsplash: 0,
  },
  'J': {
    allLvp: 950,
    mainLiving: 200,
    secondBedroom: 200,
    masterBedroom: 25,
    secondBedroomCarpet: 22,
    guestBathroom: 190,
    masterEnsuite: 70,
    laundry: 60,
    backsplash: 25,
  },
};

// Upgrade material type definitions
export interface UpgradeMaterial {
  id: 'lvp' | 'hardwood' | 'carpet' | 'tile';
  name: string;
  description: string;
  costPerUnit: number;
  unit: 'sqft' | 'sqyd';
}

export const UPGRADE_MATERIALS: UpgradeMaterial[] = [
  {
    id: 'lvp',
    name: 'Premium LVP',
    description: 'Upgrade from standard to premium luxury vinyl plank',
    costPerUnit: UPGRADE_COSTS.lvpUpgrade,
    unit: 'sqft',
  },
  {
    id: 'hardwood',
    name: 'Hardwood',
    description: 'Upgrade from LVP to premium hardwood flooring',
    costPerUnit: UPGRADE_COSTS.hardwoodUpgrade,
    unit: 'sqft',
  },
  {
    id: 'carpet',
    name: 'Premium Carpet',
    description: 'Upgrade from standard to premium carpet',
    costPerUnit: UPGRADE_COSTS.carpetUpgrade,
    unit: 'sqyd',
  },
  {
    id: 'tile',
    name: 'Porcelain Tile',
    description: 'Upgrade to porcelain tile flooring or backsplash',
    costPerUnit: UPGRADE_COSTS.tileUpgrade,
    unit: 'sqft',
  },
];

// Selection for an individual area upgrade
export interface AreaUpgradeSelection {
  areaId: UpgradeArea;
  materialType: 'lvp' | 'hardwood' | 'carpet' | 'tile';
  productName: string;
  productColor: string;
  comments: string;
}

// Backsplash grout color change option
export interface BacksplashGroutSelection {
  enabled: boolean;
  groutColor: string; // Custom color entered by buyer
  comments: string;
}

// Calculate backsplash grout color change price (flat fee, no markup)
export function calculateBacksplashGroutPrice(): { baseCost: number; markedUpCost: number; gst: number; total: number } {
  const baseCost = UPGRADE_COSTS.backsplashGroutColor; // $300 flat fee
  const markedUpCost = baseCost; // No markup for grout color change
  const gst = baseCost * GST_RATE;
  const total = baseCost + gst;
  return { baseCost, markedUpCost, gst, total };
}

// Calculate price for a single area upgrade
export function calculateAreaUpgradePrice(
  unitTypeCode: string,
  areaId: UpgradeArea,
  materialType: 'lvp' | 'hardwood' | 'carpet' | 'tile'
): { baseCost: number; markedUpCost: number; gst: number; total: number; quantity: number; unit: string } {
  const unitData = UNIT_AREA_DATA[unitTypeCode];
  if (!unitData) {
    return { baseCost: 0, markedUpCost: 0, gst: 0, total: 0, quantity: 0, unit: 'sq ft' };
  }

  const quantity = unitData[areaId] || 0;
  if (quantity === 0) {
    return { baseCost: 0, markedUpCost: 0, gst: 0, total: 0, quantity: 0, unit: 'sq ft' };
  }

  const material = UPGRADE_MATERIALS.find(m => m.id === materialType);
  if (!material) {
    return { baseCost: 0, markedUpCost: 0, gst: 0, total: 0, quantity: 0, unit: 'sq ft' };
  }

  const baseCost = quantity * material.costPerUnit;
  const markedUpCost = baseCost * (1 + MARKUP_PERCENTAGE);
  const gst = markedUpCost * GST_RATE;
  const total = markedUpCost + gst;
  const unit = material.unit === 'sqyd' ? 'sq yd' : 'sq ft';

  return { baseCost, markedUpCost, gst, total, quantity, unit };
}

// Calculate total for all selected upgrades
export function calculateTotalUpgradeCost(
  unitTypeCode: string,
  selections: AreaUpgradeSelection[]
): { subtotal: number; gst: number; total: number; lineItems: Array<{ areaName: string; quantity: number; unit: string; markedUpCost: number }> } {
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

  const gst = subtotal * GST_RATE;
  const total = subtotal + gst;

  return { subtotal, gst, total, lineItems };
}

// Get available areas for a unit type (areas with > 0 sq ft/yd)
export function getAvailableAreasForUnit(unitTypeCode: string): AreaInfo[] {
  const unitData = UNIT_AREA_DATA[unitTypeCode];
  if (!unitData) return [];

  return AREA_DEFINITIONS.filter(area => {
    const quantity = unitData[area.id];
    return quantity > 0;
  });
}

// Map simple unit type codes (A, B, G) to internal codes
// G and H units need floor specification
export function normalizeUnitTypeCode(typeCode: string | null): string | null {
  if (!typeCode) return null;
  
  const upper = typeCode.toUpperCase().trim();
  
  // Handle G and H with floor numbers
  if (upper.startsWith('G-') || upper.startsWith('H-')) {
    return upper;
  }
  
  // Direct match for single-letter codes
  if (['A', 'B', 'C', 'D', 'E', 'F', 'J'].includes(upper)) {
    return upper;
  }
  
  // If just G or H, we'll need to ask user which floor
  if (upper === 'G' || upper === 'H') {
    return upper; // Handle this case in UI
  }
  
  return null;
}

// Check if unit type requires floor selection
export function requiresFloorSelection(typeCode: string | null): boolean {
  if (!typeCode) return false;
  const upper = typeCode.toUpperCase().trim();
  return upper === 'G' || upper === 'H';
}
