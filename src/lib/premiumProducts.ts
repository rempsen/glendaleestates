// Premium carpet and premium LVP catalog (Brian's 2026-11-26 review): a buyer who upgrades picks a STYLE first, then a
// COLOUR from that style's full palette. The stored values are plain, human-readable strings (product name + colour
// with the manufacturer's number), so every output that already prints product_name / product_colour — quote lines,
// PDF, Word, CSV, QuickBooks — names the exact product without a lookup.
//
// Carpet: Dream Weaver (Engineered Floors) San Lucas 8623 and Valter 8655, same upgrade price, any colour.
//   San Lucas colours + swatches: engineeredfloors.com/products/carpet/san-lucas (product structured data, 2026-11-26).
//   Valter colours: the Valter brochure in /public/brochures (colour numbers) and carpetsindalton.com swatches — Valter
//   is no longer listed by the manufacturer and may be discontinued; adjust here if Brian says so.
// LVP: the two premium collections the Upgrades step already presents (Richmond Synergy Premium Plank, TIER Element
//   Premier), same "Premium LVP" upgrade price.
import synergyToffee from '@/assets/synergy-toffee.jpg';
import synergyDove from '@/assets/synergy-dove.jpg';
import synergyLinen from '@/assets/synergy-linen.jpg';
import synergyWheatField from '@/assets/synergy-wheat-field.jpg';
import synergyWoodcraft from '@/assets/synergy-woodcraft.jpg';
import synergyDriftwood from '@/assets/synergy-driftwood.jpg';
import tierEstateWhiteOak from '@/assets/tier-estate-white-oak.jpg';
import tierOlympicWhiteOak from '@/assets/tier-olympic-white-oak.jpg';
import tierVineyardWhiteOak from '@/assets/tier-vineyard-white-oak.jpg';
import tierSuedeEuropeanOak from '@/assets/tier-suede-european-oak.jpg';

import type { MaterialType, UpgradeArea } from '@/lib/upgradeCostData';

export type PremiumFamily = 'carpet' | 'lvp';

export interface PremiumColour {
  id: string;
  name: string;
  /** Manufacturer colour number / code. */
  code: string;
  /** Grid image (~480 px). */
  thumb: string;
  /** High-resolution image for the enlarged view. */
  full: string;
}

export interface PremiumStyle {
  id: string;
  family: PremiumFamily;
  /** Short name on the style card, e.g. "San Lucas". */
  name: string;
  /** Style / collection number shown beside the name. */
  code: string;
  /** Stored as the selection's product name, e.g. "Dream Weaver San Lucas 8623". */
  productName: string;
  brand: string;
  tagline: string;
  cover: string;
  brochurePath?: string;
  colours: PremiumColour[];
}

const dw = (style: string, slug: string) => ({
  thumb: `/swatches/dreamweaver/${style}-${slug}-thumb.webp`,
  full: `/swatches/dreamweaver/${style}-${slug}.webp`,
});
const carpetColour = (style: string, name: string, code: string): PremiumColour => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { id: `${style}-${slug}`, name, code, ...dw(style, slug) };
};
const image = (src: string) => ({ thumb: src, full: src });

export const PREMIUM_CARPET_STYLES: PremiumStyle[] = [
  {
    id: 'san-lucas',
    family: 'carpet',
    name: 'San Lucas',
    code: '8623',
    productName: 'Dream Weaver San Lucas 8623',
    brand: 'Dream Weaver by Engineered Floors',
    tagline: 'Dense textured loop with a small herringbone pattern',
    cover: '/swatches/dreamweaver/san-lucas-room.webp',
    brochurePath: '/brochures/carpet-san-lucas-brochure.pdf',
    colours: [
      carpetColour('san-lucas', 'East Cape', '6130'),
      carpetColour('san-lucas', 'Carmel Valley', '6235'),
      carpetColour('san-lucas', 'Santiago', '6253'),
      carpetColour('san-lucas', 'Monterey', '6429'),
      carpetColour('san-lucas', 'Lockwood', '8294'),
      carpetColour('san-lucas', 'Arch of Cabo', '8985'),
    ],
  },
  {
    id: 'valter',
    family: 'carpet',
    name: 'Valter',
    code: '8655',
    productName: 'Dream Weaver Valter 8655',
    brand: 'Dream Weaver by Engineered Floors',
    tagline: 'Multi-level cut loop with a subtle bamboo-leaf pattern',
    cover: '/swatches/dreamweaver/valter-room.webp',
    brochurePath: '/brochures/carpet-valter-brochure.pdf',
    colours: [
      carpetColour('valter', 'Sand Island', '8215'),
      carpetColour('valter', 'Prairie Grove', '8120'),
      carpetColour('valter', 'The Dunes', '8080'),
      carpetColour('valter', 'Yuca Bloom', '2769'),
      carpetColour('valter', 'Oberon', '8027'),
      carpetColour('valter', 'Point Break', '8153'),
      carpetColour('valter', 'Rockaway', '8199'),
      carpetColour('valter', 'Cabo', '2703'),
      carpetColour('valter', 'Beacon', '8095'),
      carpetColour('valter', 'Fortress', '8172'),
      carpetColour('valter', 'Sweet Spot', '8077'),
      carpetColour('valter', 'Vintage China', '8227'),
    ],
  },
];

export const PREMIUM_LVP_STYLES: PremiumStyle[] = [
  {
    id: 'synergy-premium',
    family: 'lvp',
    name: 'Synergy Premium Plank',
    code: 'Richmond',
    productName: 'Richmond Synergy Premium Plank',
    brand: 'Richmond',
    tagline: 'Waterproof, commercial wear layer, pre-attached cork',
    cover: synergyToffee,
    brochurePath: '/brochures/synergy-premium-plank-brochure.pdf',
    colours: [
      { id: 'synergy-toffee', name: 'Toffee', code: 'RVISYPRTOFF', ...image(synergyToffee) },
      { id: 'synergy-dove', name: 'Dove', code: 'RVISYPRDOVE', ...image(synergyDove) },
      { id: 'synergy-linen', name: 'Linen', code: 'RVISYPRLINE', ...image(synergyLinen) },
      { id: 'synergy-wheat-field', name: 'Wheat Field', code: 'RVISYPRWHEA', ...image(synergyWheatField) },
      { id: 'synergy-woodcraft', name: 'Woodcraft', code: 'RVISYPRWOOD', ...image(synergyWoodcraft) },
      { id: 'synergy-driftwood', name: 'Driftwood', code: 'RVISYPRDRIF', ...image(synergyDriftwood) },
    ],
  },
  {
    id: 'tier-element-premier',
    family: 'lvp',
    name: 'TIER Element Premier',
    code: 'PVC-free',
    productName: 'TIER Element Premier (PVC-free)',
    brand: 'TIER',
    tagline: 'PVC-free, AC6 wear rating, 5G click install',
    cover: tierEstateWhiteOak,
    brochurePath: '/brochures/tier-element-premier-brochure.pdf',
    colours: [
      { id: 'tier-estate-white-oak', name: 'Estate White Oak', code: 'STW035', ...image(tierEstateWhiteOak) },
      { id: 'tier-olympic-white-oak', name: 'Olympic White Oak', code: 'STW053', ...image(tierOlympicWhiteOak) },
      { id: 'tier-vineyard-white-oak', name: 'Vineyard White Oak', code: 'STW138', ...image(tierVineyardWhiteOak) },
      { id: 'tier-suede-european-oak', name: 'Suede European Oak', code: 'STW130', ...image(tierSuedeEuropeanOak) },
    ],
  },
];

export const premiumStylesFor = (family: PremiumFamily): PremiumStyle[] =>
  family === 'carpet' ? PREMIUM_CARPET_STYLES : PREMIUM_LVP_STYLES;

/** The stored colour text, e.g. "East Cape 6130". */
export const colourLabel = (c: PremiumColour): string => `${c.name} ${c.code}`;

/** The style a stored product name refers to (exact stored text, or the style name / number inside free text). */
export function findPremiumStyle(family: PremiumFamily, productName: string | null | undefined): PremiumStyle | undefined {
  const v = (productName || '').trim().toLowerCase();
  if (!v) return undefined;
  const styles = premiumStylesFor(family);
  return styles.find((s) => s.productName.toLowerCase() === v)
    ?? styles.find((s) => v.includes(s.name.toLowerCase()) || (/^\d+$/.test(s.code) && v.includes(s.code)));
}

/** The colour a stored colour text refers to within a style. */
export function findPremiumColour(style: PremiumStyle | undefined, colour: string | null | undefined): PremiumColour | undefined {
  const v = (colour || '').trim().toLowerCase();
  if (!style || !v) return undefined;
  return style.colours.find((c) => colourLabel(c).toLowerCase() === v)
    ?? style.colours.find((c) => v.includes(c.name.toLowerCase()));
}

/** Area-upgrade material types that use the style → colour picker. */
export const premiumFamilyForMaterial = (materialType: string | null | undefined): PremiumFamily | null =>
  materialType === 'carpet' ? 'carpet'
    : materialType === 'lvp' || materialType === 'premium_lvp' ? 'lvp'
      : null;

// 'masterBedroomCarpet' read the same quantity as 'masterBedroom' but had no price of its own ($0), so the grid showed
// Master Bedroom twice (Brian, 2026-11-26). It is hidden unless an older draft/submission already holds a row for it,
// so that row can still be opened and removed.
export const HIDDEN_AREA_IDS: ReadonlySet<UpgradeArea> = new Set<UpgradeArea>(['masterBedroomCarpet']);

/** The premium style → colour picker applies to premium carpet and premium LVP; stair 'lvp' is standard LVP with nosings. */
export const pickerFamilyFor = (areaId: UpgradeArea, materialType: MaterialType | string | null | undefined): PremiumFamily | null =>
  areaId === 'stairs' && materialType === 'lvp' ? null : premiumFamilyForMaterial(materialType);

/** A premium selection is complete only when a catalogue style AND one of its colours are chosen. */
export const premiumChoiceComplete = (family: PremiumFamily, productName?: string, productColor?: string): boolean => {
  const style = findPremiumStyle(family, productName);
  return !!style && !!findPremiumColour(style, productColor);
};

/** The wizard fields that decide whether a ticked premium carpet upgrade still needs its style / colour. */
export interface PremiumCarpetGateInput {
  hasStairs?: boolean;
  bedroomFlooringChoice?: string;
  premiumCarpetBedroom?: boolean;
  premiumCarpetBedroomStyle?: string;
  premiumCarpetBedroomColour?: string;
  stairUpgradeType?: string;
  stairPremiumCarpetSelected?: boolean;
  stairPremiumCarpetStyle?: string;
  stairPremiumCarpetColour?: string;
  /** Whether the wizard currently offers each upgrade (price > 0 / enabled). Default true. A flag on an upgrade
   * that is not offered is ignored: its checkbox and picker are hidden, so it could never be completed. */
  bedroomPremiumAvailable?: boolean;
  stairPremiumAvailable?: boolean;
}

/**
 * Wizard step names ('Bedrooms', 'Stair Carpet') where premium carpet is ticked but no catalogue style + colour is
 * chosen. The wizard keeps Continue / Submit disabled while the current step (or, for Submit, any step) is listed,
 * so a quote never carries a premium carpet line without the product to order (Codex P1 on PR #6).
 */
export function incompletePremiumCarpetSteps(s: PremiumCarpetGateInput): string[] {
  const out: string[] = [];
  if (s.bedroomPremiumAvailable !== false && s.bedroomFlooringChoice === 'carpet' && s.premiumCarpetBedroom
    && !premiumChoiceComplete('carpet', s.premiumCarpetBedroomStyle, s.premiumCarpetBedroomColour)) out.push('Bedrooms');
  if (s.stairPremiumAvailable !== false && s.hasStairs && (s.stairUpgradeType || 'standard') === 'standard' && s.stairPremiumCarpetSelected
    && !premiumChoiceComplete('carpet', s.stairPremiumCarpetStyle, s.stairPremiumCarpetColour)) out.push('Stair Carpet');
  return out;
}
