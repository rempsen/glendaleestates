// Glendale Estates - Phase 1 Data Spec
// Client: BMD Materials | 75 homes

import flooringCortland from '@/assets/flooring-cortland.jpg';
import flooringOpal from '@/assets/flooring-opal.jpg';
import flooringWolfRiver from '@/assets/flooring-wolf-river.jpg';
import tilePezzo from '@/assets/tile-pezzo.jpg';
import tilePiccolo from '@/assets/tile-piccolo.jpg';
import tileVenatino from '@/assets/tile-venatino.jpg';
import carpetWinterbrooke from '@/assets/carpet-winterbrooke.jpg';
import carpetMidnight from '@/assets/carpet-midnight.jpg';
import carpetJetstream from '@/assets/carpet-jetstream.jpg';
import carpetSawgrass from '@/assets/carpet-sawgrass.jpg';

export type SelectionStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'finalized';

export interface HomeData {
  id: string;
  lot: string;
  address: string;
  buyerName: string;
  buyerEmail: string;
  status: SelectionStatus;
  hasStairs: boolean;
  flooringCompleted: boolean;
  windowExtensions: boolean;
  windowExtensionSubtotal: number;
  windowExtensionGST: number;
  windowExtensionTotal: number;
  lastActivityDate: string;
  selectionVersion: number;
  selections?: SelectionData;
}

export interface SelectionData {
  // Main floor LVP
  lvpColour: 'cortland' | 'opal' | 'wolf-river' | null;
  // Bathroom/Laundry SPC Tile
  spcTileColour: 'pezzo' | 'piccolo' | 'venatino-auguste' | null;
  // Backsplash (fixed product, orientation choice)
  backsplashTile: 'white-subway-2x12-matte';
  backsplashOrientation: 'stacked' | 'bricked' | 'vertical' | null;
  // Stairs carpet
  stairCarpetColour: 'winterbrooke-898' | 'midnight-shadow-427' | 'jet-stream-200' | 'sawgrass-701' | null;
  // Bedroom flooring choice
  bedroomFlooringChoice: 'carpet' | 'lvp' | null;
  bedroomCarpetColour: 'winterbrooke-898' | 'midnight-shadow-427' | 'jet-stream-200' | 'sawgrass-701' | null;
  // Window coverings
  additionalWindowsQty: number;
  patioDoorsQty: number;
  // Upgrade interests
  upgradeInterestFlooring: boolean;
  upgradeInterestTile: boolean;
  upgradeInterestHeatedFloor: boolean;
  upgradeInterestAutomation: boolean;
}

// =====================================================
// PRODUCT DEFINITIONS (Per Phase 1 Spec)
// =====================================================

// 2.2 Main Floor LVP - 5mm Loose Lay LVP Plank
export const lvpOptions = [
  { 
    id: 'cortland', 
    name: 'Cortland', 
    image: flooringCortland,
    description: 'Warm, natural tones with subtle grain variation for a timeless, inviting aesthetic.'
  },
  { 
    id: 'opal', 
    name: 'Opal', 
    image: flooringOpal,
    description: 'Light, airy character with soft undertones that brighten and expand any space.'
  },
  { 
    id: 'wolf-river', 
    name: 'Wolf River', 
    image: flooringWolfRiver,
    description: 'Rich, sophisticated depth with authentic wood character and modern appeal.'
  },
];

export const lvpSpecs = {
  productType: '5mm Loose Lay LVP Plank',
  length: '48" (1218mm)',
  width: '7" (178mm)',
  thickness: '5mm (0.197")',
  wearLayer: '20mil',
  surface: 'Brushed Emboss',
  backing: 'Acoustic Absorbing',
};

// 2.3 Bathroom/Laundry SPC Tile - 12"×24"
export const spcTileOptions = [
  { 
    id: 'pezzo', 
    name: 'Pezzo', 
    image: tilePezzo,
    description: 'Terrazzo-inspired design with irregular shapes forming a harmonious, artistic pattern.'
  },
  { 
    id: 'piccolo', 
    name: 'Piccolo', 
    image: tilePiccolo,
    description: 'Rhythmic veining and textured surface echoing the elegance of classical movements.'
  },
  { 
    id: 'venatino-auguste', 
    name: 'Venatino Auguste', 
    image: tileVenatino,
    description: 'Natural marble inspiration with delicate veining for timeless sophistication.'
  },
];

export const spcTileSpecs = {
  productType: 'SPC Click Vinyl Tile',
  size: '12" × 24"',
  collection: 'Dante 2.0',
};

// 2.4 Kitchen Backsplash - White Subway 2"×12"
export const backsplashProduct = {
  name: 'Classic White Subway',
  size: '2" × 12"',
  finish: 'Matte',
  collection: 'Essential Tiles',
  description: 'Timeless white subway tile offering a clean, contemporary aesthetic.',
};

export const backsplashOrientations = [
  { id: 'stacked', name: 'Stacked', description: 'Modern vertical alignment with clean, contemporary lines' },
  { id: 'bricked', name: 'Bricked', description: 'Classic offset pattern with timeless appeal' },
  { id: 'vertical', name: 'Vertical', description: 'Elegant vertical orientation adding height to your space' },
];

// 2.5 Stairs & Bedroom Carpet
export const carpetOptions = [
  { 
    id: 'winterbrooke-898', 
    name: 'Winterbrooke 898', 
    image: carpetWinterbrooke,
    description: 'Warm neutral with subtle texture for versatile elegance.'
  },
  { 
    id: 'midnight-shadow-427', 
    name: 'Midnight Shadow 427', 
    image: carpetMidnight,
    description: 'Deep, sophisticated charcoal with luxurious depth.'
  },
  { 
    id: 'jet-stream-200', 
    name: 'Jet Stream 200', 
    image: carpetJetstream,
    description: 'Light, airy grey with contemporary appeal.'
  },
  { 
    id: 'sawgrass-701', 
    name: 'Sawgrass 701', 
    image: carpetSawgrass,
    description: 'Natural beige tones with organic warmth.'
  },
];

export const carpetSpecs = {
  productType: 'Premium Broadloom Carpet',
  features: ['Advanced stain-resistant technology', 'Dense pile construction', 'Superior sound absorption', 'Exceptional insulation'],
};

// 2.6 Window Coverings - Standard + Extensions
export const windowCoveringProduct = {
  name: 'Roller Shades',
  features: ['Clean, modern style', 'Cordless Lift System', 'Light filtering or room darkening options', 'Fabric-wrapped flat valance'],
  includedIn: 'All bedrooms',
};

// Pricing per spec (pre-GST)
export const windowPricing = {
  additionalWindow: 585,    // per window
  patioDoor: 2347.80,       // per patio door (panel track) installed
  gstRate: 0.05,            // 5% GST
};

// 2.7 Hardwood Upgrade Pricing by Unit Type (pre-GST)
// Formula: LVP Area to Hardwood = SqFt * 1.10 * $9 * 1.5
export const hardwoodUpgradePricing: Record<string, { price: number; sqft: number; description: string }> = {
  'E': { price: 13770, sqft: 1020, description: 'Mirage Hardwood Upgrade (1,020 sq ft)' },
  // Additional unit types to be added
  'J': { price: 10000, sqft: 740, description: 'Mirage Hardwood Upgrade (740 sq ft)' },
  'G': { price: 12500, sqft: 920, description: 'Mirage Hardwood Upgrade (920 sq ft)' },
  'H': { price: 12500, sqft: 920, description: 'Mirage Hardwood Upgrade (920 sq ft)' },
  'A': { price: 11200, sqft: 820, description: 'Mirage Hardwood Upgrade (820 sq ft)' },
  'B': { price: 11200, sqft: 820, description: 'Mirage Hardwood Upgrade (820 sq ft)' },
  'C': { price: 10800, sqft: 790, description: 'Mirage Hardwood Upgrade (790 sq ft)' },
  'D': { price: 11500, sqft: 850, description: 'Mirage Hardwood Upgrade (850 sq ft)' },
  'F': { price: 14200, sqft: 1050, description: 'Mirage Hardwood Upgrade (1,050 sq ft)' },
};

export const hardwoodProduct = {
  name: 'Mirage Hardwood',
  brand: 'Mirage',
  description: 'Premium Canadian-made hardwood flooring with superior durability and timeless elegance.',
  features: ['25-year residential warranty', 'Genuine hardwood', 'Pre-finished for immediate use', 'Enhanced acoustic properties'],
};

// 2.8 Bathroom Tile Upgrade Pricing by Unit Type (pre-GST)
// Formula: Ensuite = 60 sqft * 1.10 = 66 sqft * $14 = $924 * 1.7 = $1,570.80
export const bathroomTileUpgradePricing: Record<string, { ensuitePrice: number; sqft: number; description: string }> = {
  'E': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'J': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'G': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'H': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'A': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'B': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'C': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'D': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
  'F': { ensuitePrice: 1571, sqft: 66, description: 'Porcelain Tile Upgrade - Ensuite (66 sq ft)' },
};

export const porcelainTileProduct = {
  name: 'Porcelain Bathroom Floor Tile',
  description: 'Upgrade from standard LVT to premium porcelain tile for a luxurious, durable bathroom floor.',
  features: ['Water-resistant', 'Easy to clean', 'Timeless elegance', 'Enhanced durability'],
};

// 2.9 Heated Tile Floor Pricing (pre-GST)
export const heatedFloorPricing = {
  perBathroom: 1650,
  description: 'Radiant floor heating for bathroom tile floors',
  note: 'Requires Karma permission to run electrical',
};

// 2.11 Upgrade Interest Categories
export const upgradeInterestCategories = [
  { id: 'automation', name: 'Powered / Automated Window Coverings', description: 'Smart home integration with motorized controls' },
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

export const calculateWindowExtensions = (additionalWindows: number, patioDoors: number) => {
  const subtotal = (additionalWindows * windowPricing.additionalWindow) + (patioDoors * windowPricing.patioDoor);
  const gst = subtotal * windowPricing.gstRate;
  const total = subtotal + gst;
  return { subtotal, gst, total };
};

export const getStatusLabel = (status: SelectionStatus): string => {
  const labels: Record<SelectionStatus, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    finalized: 'Finalized',
  };
  return labels[status];
};

export const getStatusColor = (status: SelectionStatus): string => {
  const colors: Record<SelectionStatus, string> = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-warning/20 text-warning-foreground',
    submitted: 'bg-info/20 text-info',
    reviewed: 'bg-primary/20 text-primary',
    finalized: 'bg-success/20 text-success',
  };
  return colors[status];
};

// =====================================================
// MOCK DATA - 75 HOMES
// =====================================================

const firstNames = ['James', 'Sarah', 'Michael', 'Jennifer', 'David', 'Emily', 'Robert', 'Amanda', 'William', 'Jessica', 'Christopher', 'Ashley', 'Daniel', 'Stephanie', 'Matthew', 'Nicole', 'Andrew', 'Michelle', 'Joshua', 'Elizabeth'];
const lastNames = ['Thompson', 'Chen', 'Patel', 'Williams', 'Rodriguez', 'Kim', 'Singh', 'Anderson', 'Martinez', 'Garcia', 'Johnson', 'Lee', 'Brown', 'Wilson', 'Taylor', 'Moore', 'Jackson', 'White', 'Harris', 'Martin'];
const streets = ['Glendale Way', 'Estates Drive', 'Meadow Lane', 'Summit Court', 'Valley Road'];

const statuses: SelectionStatus[] = ['not_started', 'in_progress', 'submitted', 'reviewed', 'finalized'];

function generateRandomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  return date.toISOString().split('T')[0];
}

function generateSelections(status: SelectionStatus, hasStairs: boolean): SelectionData | undefined {
  if (status === 'not_started') return undefined;
  
  const isComplete = ['submitted', 'reviewed', 'finalized'].includes(status);
  const lvpColours = ['cortland', 'opal', 'wolf-river'] as const;
  const spcColours = ['pezzo', 'piccolo', 'venatino-auguste'] as const;
  const orientations = ['stacked', 'bricked', 'vertical'] as const;
  const carpetColours = ['winterbrooke-898', 'midnight-shadow-427', 'jet-stream-200', 'sawgrass-701'] as const;
  
  const additionalWindowsQty = Math.random() > 0.5 ? Math.floor(Math.random() * 5) : 0;
  const patioDoorsQty = Math.random() > 0.7 ? Math.floor(Math.random() * 2) + 1 : 0;
  
  return {
    lvpColour: isComplete || Math.random() > 0.3 ? lvpColours[Math.floor(Math.random() * 3)] : null,
    spcTileColour: isComplete || Math.random() > 0.3 ? spcColours[Math.floor(Math.random() * 3)] : null,
    backsplashTile: 'white-subway-2x12-matte',
    backsplashOrientation: isComplete || Math.random() > 0.4 ? orientations[Math.floor(Math.random() * 3)] : null,
    stairCarpetColour: hasStairs ? (isComplete || Math.random() > 0.4 ? carpetColours[Math.floor(Math.random() * 4)] : null) : null,
    bedroomFlooringChoice: isComplete || Math.random() > 0.3 ? (Math.random() > 0.6 ? 'carpet' : 'lvp') : null,
    bedroomCarpetColour: Math.random() > 0.4 ? carpetColours[Math.floor(Math.random() * 4)] : null,
    additionalWindowsQty,
    patioDoorsQty,
    upgradeInterestFlooring: Math.random() > 0.6,
    upgradeInterestTile: Math.random() > 0.7,
    upgradeInterestHeatedFloor: Math.random() > 0.75,
    upgradeInterestAutomation: Math.random() > 0.65,
  };
}

export const homes: HomeData[] = Array.from({ length: 75 }, (_, i) => {
  const lot = `${i + 1}`.padStart(3, '0');
  const streetNum = 100 + i;
  const street = streets[Math.floor(i / 15)];
  const status = statuses[Math.floor(Math.random() * 5)];
  const hasStairs = Math.random() > 0.15; // 85% of homes have stairs
  const selections = generateSelections(status, hasStairs);
  
  const { subtotal, gst, total } = selections 
    ? calculateWindowExtensions(selections.additionalWindowsQty, selections.patioDoorsQty)
    : { subtotal: 0, gst: 0, total: 0 };
  
  return {
    id: `home-${lot}`,
    lot: `Lot ${lot}`,
    address: `${streetNum} ${street}`,
    buyerName: `${firstNames[Math.floor(Math.random() * firstNames.length)]} & ${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
    buyerEmail: `buyer${lot}@email.com`,
    status,
    hasStairs,
    flooringCompleted: selections?.lvpColour !== null && selections?.spcTileColour !== null,
    windowExtensions: (selections?.additionalWindowsQty || 0) > 0 || (selections?.patioDoorsQty || 0) > 0,
    windowExtensionSubtotal: subtotal,
    windowExtensionGST: gst,
    windowExtensionTotal: total,
    lastActivityDate: generateRandomDate(60),
    selectionVersion: status === 'not_started' ? 0 : Math.floor(Math.random() * 3) + 1,
    selections,
  };
});

// =====================================================
// DASHBOARD AGGREGATIONS
// =====================================================

export const getDashboardStats = () => {
  const statusCounts = homes.reduce((acc, home) => {
    acc[home.status] = (acc[home.status] || 0) + 1;
    return acc;
  }, {} as Record<SelectionStatus, number>);

  const completedCount = (statusCounts.submitted || 0) + (statusCounts.reviewed || 0) + (statusCounts.finalized || 0);
  const windowExtensionHomes = homes.filter(h => h.windowExtensions).length;
  
  const totalWindowSubtotal = homes.reduce((sum, h) => sum + h.windowExtensionSubtotal, 0);
  const totalWindowGST = homes.reduce((sum, h) => sum + h.windowExtensionGST, 0);
  const totalWindowRevenue = homes.reduce((sum, h) => sum + h.windowExtensionTotal, 0);
  
  const upgradeInterests = {
    flooring: homes.filter(h => h.selections?.upgradeInterestFlooring).length,
    tile: homes.filter(h => h.selections?.upgradeInterestTile).length,
    heatedFloor: homes.filter(h => h.selections?.upgradeInterestHeatedFloor).length,
    automation: homes.filter(h => h.selections?.upgradeInterestAutomation).length,
  };

  return {
    totalHomes: homes.length,
    statusCounts,
    completedCount,
    completionRate: Math.round((completedCount / homes.length) * 100),
    windowExtensionHomes,
    windowExtensionRate: Math.round((windowExtensionHomes / homes.length) * 100),
    totalWindowSubtotal,
    totalWindowGST,
    totalWindowRevenue,
    avgUpgradePerHome: totalWindowRevenue / homes.length,
    upgradeInterests,
  };
};
