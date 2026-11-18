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
  | 'masterBedroomLvp' // sq ft - master bedroom LVP area
  | 'masterBedroom' // sq yards - master bedroom carpet (G/H 2nd floor: all bedrooms and hallway)
  | 'secondBedroomCarpet' // sq yards
  | 'masterBedroomCarpet' // sq yards - for carpet bedroom upgrades
  | 'stairs' // sq yards - stair carpet
  | 'guestBathroom'
  | 'masterEnsuite'
  | 'laundry'
  | 'backsplash'
  | 'allLvp'; // entire unit standard LVP areas

// Area categories for determining available upgrade types
export type AreaCategory = 'living' | 'bedroom' | 'bedroom-carpet' | 'stairs' | 'bathroom' | 'laundry' | 'backsplash';

// Upgrade material type definitions (moved here so AreaInfo can reference it)
export type MaterialType = 'lvp' | 'hardwood' | 'lvt' | 'carpet' | 'tile' | 'nonstandard_lvp' | 'nonstandard_lvt' | 'nonstandard_tile' | 'premium_lvp' | 'premium_carpet_underpad';

export interface AreaInfo {
  id: UpgradeArea;
  name: string;
  description: string;
  unit: 'sqft' | 'sqyd';
  upgradeTypes: MaterialType[];
  category: AreaCategory;
  supportsHeatedFloor?: boolean; // Only for tile in bathrooms
  icon: string; // Lucide icon name
}

export const AREA_DEFINITIONS: AreaInfo[] = [
  {
    id: 'mainLiving',
    name: 'Main Living Area',
    description: 'Living room, dining room, and kitchen flooring',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'lvt', 'nonstandard_lvp', 'nonstandard_lvt'],
    category: 'living',
    icon: 'Sofa',
  },
  {
    id: 'secondBedroom',
    name: 'Second Bedroom',
    description: 'Guest bedroom or office area flooring (LVP standard)',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'lvt', 'nonstandard_lvp', 'nonstandard_lvt'],
    category: 'bedroom',
    icon: 'BedDouble',
  },
  {
    id: 'masterBedroomLvp',
    name: 'Master Bedroom (LVP)',
    description: 'Primary bedroom flooring (LVP standard)',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'lvt', 'nonstandard_lvp', 'nonstandard_lvt'],
    category: 'bedroom',
    icon: 'Bed',
  },
  {
    id: 'masterBedroom',
    name: 'Master Bedroom (Carpet)',
    description: 'Primary bedroom carpet area - G/H 2nd floor: All bedrooms and hallway',
    unit: 'sqyd',
    upgradeTypes: ['carpet'],
    category: 'bedroom-carpet',
    icon: 'Bed',
  },
  {
    id: 'secondBedroomCarpet',
    name: 'Second Bedroom Carpet',
    description: 'Upgrade carpet in the second bedroom (carpet standard)',
    unit: 'sqyd',
    upgradeTypes: ['carpet'],
    category: 'bedroom-carpet',
    icon: 'Grid3x3',
  },
  {
    id: 'masterBedroomCarpet',
    name: 'Master Bedroom Carpet',
    description: 'Upgrade carpet in the master bedroom (carpet standard)',
    unit: 'sqyd',
    upgradeTypes: ['carpet'],
    category: 'bedroom-carpet',
    icon: 'Bed',
  },
  {
    id: 'stairs',
    name: 'Stairs',
    description: 'Upgrade flooring on stairs (carpet standard)',
    unit: 'sqyd',
    upgradeTypes: ['carpet', 'lvp', 'premium_lvp'],
    category: 'stairs',
    icon: 'Home',
  },
  {
    id: 'guestBathroom',
    name: 'Guest Bathroom',
    description: 'Secondary bathroom flooring',
    unit: 'sqft',
    upgradeTypes: ['tile', 'nonstandard_tile'],
    category: 'bathroom',
    supportsHeatedFloor: true,
    icon: 'Bath',
  },
  {
    id: 'masterEnsuite',
    name: 'Master Ensuite',
    description: 'Primary bathroom flooring',
    unit: 'sqft',
    upgradeTypes: ['tile', 'nonstandard_tile'],
    category: 'bathroom',
    supportsHeatedFloor: true,
    icon: 'ShowerHead',
  },
  {
    id: 'laundry',
    name: 'Laundry Room',
    description: 'Laundry room flooring',
    unit: 'sqft',
    upgradeTypes: ['tile', 'lvt', 'nonstandard_tile', 'nonstandard_lvt'],
    category: 'laundry',
    icon: 'WashingMachine',
  },
  {
    id: 'backsplash',
    name: 'Kitchen Backsplash',
    description: 'Tile backsplash in kitchen',
    unit: 'sqft',
    upgradeTypes: ['tile'],
    category: 'backsplash',
    icon: 'LayoutGrid',
  },
  {
    id: 'allLvp',
    name: 'All Standard LVP Areas',
    description: 'All standard LVP flooring throughout the unit (excludes LVT in bathrooms/laundry)',
    unit: 'sqft',
    upgradeTypes: ['lvp', 'hardwood', 'lvt', 'nonstandard_lvp', 'nonstandard_lvt'],
    category: 'living',
    icon: 'Home',
  },
];

// Square footage/yardage by unit type and area
// Values from the cost sheet
export interface UnitAreaData {
  allLvp: number; // sq ft - All Standard LVP Areas
  mainLiving: number; // sq ft
  secondBedroom: number; // sq ft
  masterBedroomLvp: number; // sq ft - Master Bedroom LVP area
  masterBedroom: number; // sq yd - Master Bedroom Carpet (G/H 2nd floor: All bedrooms and hallway)
  secondBedroomCarpet: number; // sq yd
  masterBedroomCarpet: number; // sq yd
  stairs: number; // sq yd - stair carpet
  guestBathroom: number; // sq ft - LVT
  masterEnsuite: number; // sq ft - LVT
  laundry: number; // sq ft - LVT
  backsplash: number; // sq ft
  [key: string]: number | undefined;
}

export const UNIT_AREA_DATA: Record<string, UnitAreaData> = {
  'A': {
    allLvp: 1350,
    mainLiving: 250,
    secondBedroom: 200,
    masterBedroomLvp: 250, // sq ft
    masterBedroom: 10, // sq yd - carpet
    secondBedroomCarpet: 20, // sq yd
    masterBedroomCarpet: 10, // sq yd
    stairs: 0,
    guestBathroom: 165,
    masterEnsuite: 80,
    laundry: 0, // included in LVP or closet
    backsplash: 30,
  },
  'B': {
    allLvp: 1150,
    mainLiving: 250,
    secondBedroom: 180,
    masterBedroomLvp: 250, // sq ft
    masterBedroom: 10, // sq yd - carpet
    secondBedroomCarpet: 20, // sq yd
    masterBedroomCarpet: 10, // sq yd
    stairs: 0,
    guestBathroom: 135,
    masterEnsuite: 75,
    laundry: 0,
    backsplash: 25,
  },
  'C': {
    allLvp: 1500,
    mainLiving: 360,
    secondBedroom: 200,
    masterBedroomLvp: 360, // sq ft
    masterBedroom: 12, // sq yd - carpet
    secondBedroomCarpet: 24, // sq yd
    masterBedroomCarpet: 12, // sq yd
    stairs: 0,
    guestBathroom: 200,
    masterEnsuite: 80,
    laundry: 60,
    backsplash: 25,
  },
  'D': {
    allLvp: 1500,
    mainLiving: 360,
    secondBedroom: 200,
    masterBedroomLvp: 360, // sq ft
    masterBedroom: 12, // sq yd - carpet
    secondBedroomCarpet: 24, // sq yd
    masterBedroomCarpet: 12, // sq yd
    stairs: 0,
    guestBathroom: 200,
    masterEnsuite: 80,
    laundry: 60,
    backsplash: 25,
  },
  'E': {
    allLvp: 1050,
    mainLiving: 200,
    secondBedroom: 180,
    masterBedroomLvp: 200, // sq ft
    masterBedroom: 10, // sq yd - carpet
    secondBedroomCarpet: 22, // sq yd
    masterBedroomCarpet: 10, // sq yd
    stairs: 0,
    guestBathroom: 150,
    masterEnsuite: 60,
    laundry: 40,
    backsplash: 25,
  },
  'F': {
    allLvp: 1050,
    mainLiving: 200,
    secondBedroom: 180,
    masterBedroomLvp: 200, // sq ft
    masterBedroom: 10, // sq yd - carpet
    secondBedroomCarpet: 22, // sq yd
    masterBedroomCarpet: 10, // sq yd
    stairs: 0,
    guestBathroom: 150,
    masterEnsuite: 60,
    laundry: 40,
    backsplash: 25,
  },
  'G-1': {
    allLvp: 700,
    mainLiving: 0, // 1st floor layout different
    secondBedroom: 0,
    masterBedroomLvp: 0, // no LVP on 2nd floor
    masterBedroom: 0, // no carpet on 1st floor
    secondBedroomCarpet: 0,
    masterBedroomCarpet: 0,
    stairs: 15, // sq yd for townhouse stairs
    guestBathroom: 200,
    masterEnsuite: 50,
    laundry: 50,
    backsplash: 25,
  },
  'G-2': {
    allLvp: 900,
    mainLiving: 0,
    secondBedroom: 0,
    masterBedroomLvp: 0, // no LVP on 2nd floor
    masterBedroom: 14, // sq yd - All bedrooms and hallway carpet
    secondBedroomCarpet: 0,
    masterBedroomCarpet: 14, // sq yd
    stairs: 0,
    guestBathroom: 0,
    masterEnsuite: 50,
    laundry: 0,
    backsplash: 0,
  },
  'H-1': {
    allLvp: 600,
    mainLiving: 0,
    secondBedroom: 0,
    masterBedroomLvp: 0, // no LVP on 2nd floor
    masterBedroom: 0, // no carpet on 1st floor
    secondBedroomCarpet: 0,
    masterBedroomCarpet: 0,
    stairs: 12, // sq yd for townhouse stairs
    guestBathroom: 190,
    masterEnsuite: 50,
    laundry: 40,
    backsplash: 25,
  },
  'H-2': {
    allLvp: 675,
    mainLiving: 0,
    secondBedroom: 0,
    masterBedroomLvp: 0, // no LVP on 2nd floor
    masterBedroom: 10, // sq yd - All bedrooms and hallway carpet
    secondBedroomCarpet: 0,
    masterBedroomCarpet: 10, // sq yd
    stairs: 0,
    guestBathroom: 0,
    masterEnsuite: 50,
    laundry: 0,
    backsplash: 0,
  },
  'J': {
    allLvp: 950,
    mainLiving: 200,
    secondBedroom: 200,
    masterBedroomLvp: 200, // sq ft
    masterBedroom: 10, // sq yd - carpet
    secondBedroomCarpet: 22, // sq yd
    masterBedroomCarpet: 10, // sq yd
    stairs: 0,
    guestBathroom: 190,
    masterEnsuite: 70,
    laundry: 60,
    backsplash: 25,
  },
};

export interface UpgradeMaterial {
  id: MaterialType;
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
    id: 'lvt',
    name: 'Premium LVT',
    description: 'Upgrade from standard to premium luxury vinyl tile',
    costPerUnit: UPGRADE_COSTS.lvpUpgrade, // Same pricing as LVP
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
    description: 'Upgrade to porcelain tile flooring',
    costPerUnit: UPGRADE_COSTS.tileUpgrade,
    unit: 'sqft',
  },
  {
    id: 'nonstandard_lvp',
    name: 'Non Standard LVP Color',
    description: 'Select a non-standard color from the LVP collection',
    costPerUnit: 2.50,
    unit: 'sqft',
  },
  {
    id: 'nonstandard_lvt',
    name: 'Non Standard LVT Color',
    description: 'Select a non-standard color from the LVT collection',
    costPerUnit: 2.50,
    unit: 'sqft',
  },
  {
    id: 'nonstandard_tile',
    name: 'Non Standard Tile Color',
    description: 'Select a non-standard color from the tile collection',
    costPerUnit: 3.00,
    unit: 'sqft',
  },
  {
    id: 'premium_carpet_underpad',
    name: 'Premium Underpad',
    description: 'Premium carpet underpad upgrade',
    costPerUnit: 6.00,
    unit: 'sqyd',
  },
];

// Selection for an individual area upgrade
export interface AreaUpgradeSelection {
  areaId: UpgradeArea;
  materialType: MaterialType;
  productName: string;
  productColor: string;
  comments: string; // INTERNAL (staff-only) since 2026-11-16; never printed on buyer outputs
  clientComment?: string; // Buyer-visible note; the only area note buyer outputs print
  heatedFloor?: boolean; // Only for tile in bathrooms
  // Manual price quoted by the BMD office (GST-exclusive, PST already included).
  // When set (> 0) it overrides the calculated area × material price.
  manualPrice?: number | null;
  manualPriceNote?: string;
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
  materialType: MaterialType
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

  // Handle G and H with floor numbers (e.g. "G-1", "Corner Unit G-2")
  const floorMatch = upper.match(/\b([GH])-?\s?([12])\b/);
  if (floorMatch) return `${floorMatch[1]}-${floorMatch[2]}`;

  // Direct match for single-letter codes
  if (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'].includes(upper)) {
    return upper;
  }

  // Extract trailing letter from labels like "Corner Unit E", "Unit Type A",
  // "Type J", "Unit B (Corner)". Take the LAST standalone letter token.
  const letterMatches = upper.match(/\b([A-J])\b/g);
  if (letterMatches && letterMatches.length > 0) {
    const candidate = letterMatches[letterMatches.length - 1];
    if (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'].includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

// Check if unit type requires floor selection
export function requiresFloorSelection(typeCode: string | null): boolean {
  if (!typeCode) return false;
  const upper = typeCode.toUpperCase().trim();
  return upper === 'G' || upper === 'H';
}
