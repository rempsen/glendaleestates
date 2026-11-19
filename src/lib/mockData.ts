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

export const hardwoodProduct = {
  name: 'Mirage Hardwood',
  brand: 'Mirage',
  description: 'Premium Canadian-made hardwood flooring with superior durability and timeless elegance.',
  features: ['25-year residential warranty', 'Genuine hardwood', 'Pre-finished for immediate use', 'Enhanced acoustic properties'],
};

export const porcelainTileProduct = {
  name: 'Porcelain Bathroom Floor Tile',
  description: 'Upgrade from standard LVT to premium porcelain tile for a luxurious, durable bathroom floor.',
  features: ['Water-resistant', 'Easy to clean', 'Timeless elegance', 'Enhanced durability'],
};

// 2.11 Upgrade Interest Categories
export const upgradeInterestCategories: { id: string; name: string; description: string }[] = [];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

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

/**
 * Resolve a stored selection value (wizard id like "wolf-river" OR an
 * admin-entered display name like "Wolf River" / "Venatino Polished")
 * to a display name. Never drops unknown values — returns them as-is.
 */
export function resolveOptionName(
  options: ReadonlyArray<{ id: string; name: string }>,
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = norm(value);
  const id = toOptionId(value);
  const hit = options.find(o => o.id === id);
  return hit ? hit.name : value;
}

// Legacy / alternate names used by staff that refer to the same product.
const OPTION_ALIASES: Record<string, string> = {
  venatinopolished: 'venatino-auguste',
  venatino: 'venatino-auguste',
  pezzogrey: 'pezzo',
  piccolowhite: 'piccolo',
  winterbrooke: 'winterbrooke-898',
  midnight: 'midnight-shadow-427',
  midnightshadow: 'midnight-shadow-427',
  jetstream: 'jet-stream-200',
  sawgrass: 'sawgrass-701',
};

/** Convert any stored value (id, display name, or legacy alias) to the canonical wizard id. */
export function toOptionId(value: string | null | undefined): string {
  if (!value) return '';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = norm(value);
  if (OPTION_ALIASES[v]) return OPTION_ALIASES[v];
  const all = [...lvpOptions, ...spcTileOptions, ...carpetOptions];
  const hit = all.find(o => o.id === value || norm(o.id) === v || norm(o.name) === v);
  return hit ? hit.id : value;
}
