// =====================================================================
// generateQuoteLines — the pure quote-line generator (Phase 2, spec §6.1 / §6.4).
//
// ZERO IMPORTS, no Deno/Node/browser globals: the same bytes run in the browser (via the `@shared/*` alias,
// re-exported by src/lib/quoteLines.ts), in edge functions and in bun tests.
//
// This file is the only place that does price arithmetic (markup, GST, percent → rate); scripts/callers.test.ts
// fails on any other file that does. The Phase 1 engines it replaced were deleted in Phase 2 Task 18; the nine
// live-unit subtotals they produced stay pinned, to the cent, in scripts/parity.test.ts.
//
// Every price comes from `pricing` (pricing_config / upgrade_materials / unit_area_data). Strings copied here
// (area/material names, buyer wording) carry no prices.
// `price_source_ref` is always prefixed, as in the console: `material:<key>`, `config:<key>`, `override:<key>`,
// `manual:<field>`, `custom:<id>`.
// =====================================================================

export type Section =
  | 'standard' | 'flooring' | 'tile' | 'backsplash' | 'stairs'
  | 'window_coverings' | 'bathroom' | 'basement' | 'other';
export type LineStatus = 'included' | 'upgrade' | 'pending' | 'under_review' | 'deferred' | 'removed';
export type LineUnit = 'sqft' | 'sqyd' | 'each' | 'flat';
export type PricingMode = 'catalog' | 'flat_rate' | 'manual' | 'included';
export type LineSource = 'wizard' | 'office' | 'buyer_request' | 'migration';

/** One `quote_lines` row (spec §6.1). `counts_in_total` is a DB generated column and is never sent. */
export interface QuoteLine {
  id?: string;
  submission_id?: string;
  sort_order: number;
  section: Section;
  location: string;
  label: string;
  product_name?: string | null;
  product_colour?: string | null;
  material_key?: string | null;
  quantity?: number | null;
  unit: LineUnit;
  unit_price?: number | null;
  amount?: number | null;
  pricing_mode: PricingMode;
  price_source_ref?: string | null;
  status: LineStatus;
  client_visible: boolean;
  client_note?: string | null;
  internal_note?: string | null;
  source: LineSource;
  flagged_to?: string | null;
  provisional: boolean;
  wizard_field?: string | null;
}

/** Spec section order; `sort_order` follows it, then insertion order. */
// ---- Price arithmetic primitives ----
// Everything outside this file that needs a marked-up or GST-inclusive figure (option hints in the wizard, Pricing
// Control previews, console presets, pricing loaders) calls these instead of multiplying itself.

/** pricing_config stores percentages as whole numbers (markup 60, GST 5); prices use fractions (0.6, 0.05). */
export const rateFromPercent = (percent: number): number => Number(percent) / 100;
/** Customer price of a base cost: cost × (1 + markup). */
export const markedUp = (cost: number, markup: number): number => cost * (1 + markup);
/** GST on a pre-GST amount. */
export const gstOn = (amount: number, gstRate: number): number => amount * gstRate;
/** A pre-GST amount with GST added (display hints; quote totals come from `sumQuoteLines`). */
export const withGst = (amount: number, gstRate: number): number => amount + gstOn(amount, gstRate);

export const SECTION_ORDER: readonly Section[] = [
  'standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other',
];

// ---- Input shapes (structural copies; no imports) ----

/** Built from pricing_config / upgrade_materials / unit_area_data by `serverPricingFromRows` (./loadServerPricing.ts). */
export interface QuoteUnitArea { [key: string]: number | undefined }
export interface QuotePricing {
  materials: Record<string, number>;
  config: Record<string, number>;
  unitAreas: Record<string, QuoteUnitArea>;
  markupPercentage: number;
  gstRate: number;
}

export interface QuoteAreaUpgrade {
  areaId: string;
  materialType: string;
  productName?: string;
  productColor?: string;
  comments?: string;
  clientComment?: string;
  heatedFloor?: boolean;
  manualPrice?: number | null;
  manualPriceNote?: string;
  areaLabel?: string;
}

export interface QuoteCustomItem {
  id?: string;
  label?: string;
  detail?: string;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  amount?: number | null;
  catalogKey?: string;
  status?: string;
  area?: string;
  note?: string;
}

export interface QuoteCustomPricing {
  overrides?: { [key: string]: { amount?: number | null | string; label?: string } | undefined };
  customItems?: QuoteCustomItem[];
  provisional?: { [field: string]: string };
  [key: string]: unknown;
}

/**
 * `BuyerSelections` (src/lib/buyerPdfGenerator.ts, built by `toBuyerPdfSelections(row)`) — the same object callers
 * pass to `totalsInputFromSelections` today. Only the fields lines need are listed; colours feed `product_colour`.
 */
export interface QuoteSelections {
  areaUpgrades: QuoteAreaUpgrade[];
  upgradeFloorSelection?: '1' | '2' | string | null;
  backsplashGrout?: { enabled?: boolean; groutColor?: string; comments?: string } | null;
  stairUpgradeType?: string | null;
  stairLvpUpgradeSelected?: boolean;
  stairPremiumCarpetSelected?: boolean;
  premiumUnderpadStairs?: boolean;
  bedroomFlooringChoice?: string | null;
  premiumCarpetBedroom?: boolean;
  premiumUnderpadBedroom?: boolean;
  additionalWindowsQty?: number;
  patioDoorsQty?: number;
  automatedWindowsQty?: number;
  bathroomTileSelected?: boolean;
  bathroomTileEnsuiteSelected?: boolean;
  bathroomTileGuestSelected?: boolean;
  heatedFloorBathrooms?: number;
  customTiledShower?: boolean;
  customPricing?: QuoteCustomPricing | null;
  lvpColour?: string;
  spcTileColour?: string;
  stairCarpetColour?: string;
  bedroomCarpetColour?: string;
  bedroomLvpColour?: string;
  bedroomLvpSameAsMain?: boolean;
  backsplashOrientation?: string;
}

/** `BaseSpecRow` from src/lib/baseSpec.ts (pass `baseSpecFor(unitTypeCode)`). */
export interface QuoteBaseSpecRow {
  section: string;
  location: string;
  label: string;
  defaultProduct: string | null;
  defaultColourOptions?: string[];
  isIncluded: boolean;
}

/** Window covering kinds the wizard collects (spec §6.3). */
export type QuoteWindowKind = 'roller_5' | 'roller_1' | 'panel_track' | 'included';
/**
 * One located window from the wizard's Windows step. `included` rows are the base-spec bedroom shades: they add no
 * opening line (the base spec already lists them at $0) and exist only so a bedroom shade can be motorized.
 */
export interface QuoteWindow { location: string; kind: QuoteWindowKind; motorized: boolean }

/** product_name per kind (no prices). */
export const WINDOW_KIND_PRODUCTS: Record<Exclude<QuoteWindowKind, 'included'>, string> = {
  roller_5: 'Roller shade 5%',
  roller_1: 'Roller shade 1%',
  panel_track: 'Sliding panel track',
};

/**
 * The three integer columns the located list stands for: additional = roller rows, patio = panel-track rows,
 * automated = motorized rows (included bedroom shades too). The wizard writes these to buyer_selections.
 */
export function windowCounts(windows: readonly QuoteWindow[]): {
  additionalWindowsQty: number; patioDoorsQty: number; automatedWindowsQty: number;
} {
  let additionalWindowsQty = 0; let patioDoorsQty = 0; let automatedWindowsQty = 0;
  for (const w of windows) {
    if (w.kind === 'panel_track') patioDoorsQty++;
    else if (w.kind !== 'included') additionalWindowsQty++;
    if (w.motorized) automatedWindowsQty++;
  }
  return { additionalWindowsQty, patioDoorsQty, automatedWindowsQty };
}

export interface GenerateInput {
  selections: QuoteSelections;
  unitTypeCode: string | null;
  pricing: QuotePricing;
  /** Defaults to `pricing.unitAreas`. */
  unitAreas?: Record<string, QuoteUnitArea>;
  baseSpec: QuoteBaseSpecRow[];
  /** Defaults to `selections.customPricing`. */
  customPricing?: QuoteCustomPricing | null;
  submissionId?: string;
  /** Source of the generated (non-office) lines: 'wizard' (default) or 'migration' for the backfill. */
  source?: 'wizard' | 'migration';
  /**
   * Located windows (wizard). Used for locations and product names only: amounts still come from the three integer
   * quantities, and the list is ignored (generic `Additional Window N` / `Patio Door N` lines) unless its counts equal
   * those integers and every count is within MAX_WINDOW_QTY.
   */
  windows?: QuoteWindow[] | null;
  /**
   * Colour option names (normalised key: lowercase alphanumerics of an id, name or legacy alias → display name), so
   * stored ids ("venatino-auguste", "winterbrooke-898") print as Phase 1's resolveOptionName did. Supplied by
   * generateInputFromRowCore from ./optionNames.ts (this module stays import-free). Names only; no prices.
   */
  colourNames?: Readonly<Record<string, string>> | null;
}

// ---- Copied constants (names only; no prices) ----

/** Buyer wording: mirrors toBuyerWording in src/lib/outputLabels.ts and ./buyerWording.ts. */
const toBuyerWording = (s: string): string => s.replace(/Master Bedroom/g, 'Primary Bedroom');

/** Area → quote location; base-spec locations where one exists (src/lib/baseSpec.ts). */
const AREA_LOCATIONS: Record<string, string> = {
  mainLiving: 'Main Living',
  secondBedroom: 'Second Bedroom',
  masterBedroomLvp: 'Primary Bedroom',
  masterBedroom: 'Primary Bedroom',
  masterBedroomCarpet: 'Primary Bedroom',
  secondBedroomCarpet: 'Second Bedroom',
  guestBathroom: 'Main Bathroom',
  masterEnsuite: 'Primary Ensuite',
  laundry: 'Laundry Room',
  backsplash: 'Kitchen',
  allLvp: 'All Standard LVP Areas',
  stairs: 'Stairs to Lower Level',
};
const SQYD_AREAS = new Set(['masterBedroom', 'secondBedroomCarpet', 'masterBedroomCarpet', 'stairs']);

/** Material names as in UPGRADE_MATERIALS (src/lib/upgradeCostData.ts). */
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  laminate: 'Premium Laminate',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
  tiled_shower: 'Custom Tiled Shower',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
  premium_carpet_underpad: 'Premium Underpad',
};

/** Same table as both engines' AREA_FIELD_MAP. */
const AREA_FIELD_MAP: Record<string, string> = {
  allLvp: 'allLvp', mainLiving: 'mainLiving', secondBedroom: 'secondBedroom', masterBedroomLvp: 'masterBedroomLvp',
  masterBedroom: 'masterBedroom', secondBedroomCarpet: 'secondBedroomCarpet', masterBedroomCarpet: 'masterBedroom',
  guestBathroom: 'guestBathroom', masterEnsuite: 'masterEnsuite', laundry: 'laundry', backsplash: 'backsplash',
};

const BEDROOM_CARPET_PRODUCT = 'Luxor I carpet + standard underpad';
const BEDROOM_LVP_PRODUCT = 'XL Flooring LVP';
const STAIRS_LOWER = 'Stairs to Lower Level';

/** Most window / patio door / motor lines itemised per quantity column (controller ruling). */
export const MAX_WINDOW_QTY = 50;

const isTile = (m: string) => m === 'tile' || m === 'nonstandard_tile';

/** Copy of normalizeUnitTypeCode in src/lib/upgradeCostData.ts (the client engine's normaliser). */
export function normalizeUnitTypeCode(typeCode: string | null | undefined): string | null {
  if (!typeCode) return null;
  const upper = typeCode.toUpperCase().trim();
  const floorMatch = upper.match(/\b([GH])-?\s?([12])\b/);
  if (floorMatch) return `${floorMatch[1]}-${floorMatch[2]}`;
  const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];
  if (codes.includes(upper)) return upper;
  const letterMatches = upper.match(/\b([A-J])\b/g);
  if (letterMatches && letterMatches.length > 0) {
    const candidate = letterMatches[letterMatches.length - 1];
    if (codes.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * Float-noise normalisation, NOT cent rounding: neither engine rounds (they sum raw floats and format at display),
 * so line amounts keep full precision to 1e-6 (44 × 6 × 1.6 = 422.40000000000003 → 422.4).
 */
const norm = (x: number): number => Math.round(x * 1e6) / 1e6;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/**
 * Stored colour (option id, name or legacy alias) → display name: `colourNames` first (resolveOptionName's table),
 * then the base-spec option text ("sawgrass-701" → "Sawgrass 701"); unknown values kept as typed.
 */
function colourText(
  value: string | null | undefined, options: string[] | undefined, names?: Readonly<Record<string, string>> | null,
): string | null {
  const v = (value || '').trim();
  if (!v) return null;
  const named = names ? names[v.toLowerCase().replace(/[^a-z0-9]/g, '')] : undefined;
  if (named) return named;
  const hit = (options || []).find((o) => slug(o) === slug(v));
  return hit || v;
}

const filled = (v: unknown) => v !== null && v !== undefined && String(v) !== '';
const text = (v: unknown) => { const s = String(v ?? '').trim(); return s || null; };
const joinNotes = (...parts: Array<string | null | undefined>) => parts.map((p) => (p || '').trim()).filter(Boolean).join(' · ') || null;

const WINDOW_LIKE = /shade|blind|window|patio|panel track|somfy|motori|drape|curtain/i;

/** Office custom item → section, by area first, then label keywords. */
function officeSection(item: QuoteCustomItem, included: boolean): Section {
  const area = String(item.area || '');
  const label = String(item.label || '');
  if (/stair/i.test(area)) return 'stairs';
  if (/basement/i.test(area)) return 'basement';
  // The engines priced office items as upgrades, never as windows, and parity bound `windowCoverings` to the engine
  // `windowSubtotal`; so a counted window-like office item stays in 'other'. Included ($0) ones join window_coverings.
  if (WINDOW_LIKE.test(label)) return included ? 'window_coverings' : 'other';
  if (/grout|backsplash/i.test(label)) return 'backsplash';
  if (/shower|heated/i.test(label)) return 'bathroom';
  if (/tile/i.test(label)) return 'tile';
  if (/carpet|underpad|lvp|lvt|laminate|hardwood|floor/i.test(label)) return 'flooring';
  return 'other';
}

function officeUnit(u: string | null | undefined, hasQty: boolean): LineUnit {
  const s = String(u || '').toLowerCase().replace(/[\s.]/g, '');
  if (s === 'sqft' || s === 'sf') return 'sqft';
  if (s === 'sqyd' || s === 'sy') return 'sqyd';
  if (s === 'each' || s === 'ea') return 'each';
  if (s === 'flat') return 'flat';
  return hasQty ? 'each' : 'flat';
}

type Draft = Omit<QuoteLine, 'sort_order'>;

export function generateQuoteLines(input: GenerateInput): QuoteLine[] {
  const s = input.selections;
  const p = input.pricing;
  const m = p.markupPercentage;
  const unitAreas = input.unitAreas || p.unitAreas || {};
  const cp: QuoteCustomPricing = (input.customPricing ?? s.customPricing ?? {}) as QuoteCustomPricing;
  const overrides = (cp && typeof cp === 'object' && cp.overrides && typeof cp.overrides === 'object') ? cp.overrides : {};
  const customItems: QuoteCustomItem[] = cp && Array.isArray(cp.customItems) ? cp.customItems : [];
  const provisional: Record<string, string> = cp && cp.provisional && typeof cp.provisional === 'object' ? cp.provisional : {};
  const genSource: LineSource = input.source || 'wizard';

  const cfg = (k: string): number => Number(p.config[k]) || 0;
  const mat = (k: string): number => Number(p.materials[k]) || 0;
  const areaFor = (code: string): QuoteUnitArea | null => {
    const key = Object.keys(unitAreas).find((c) => c.toUpperCase() === code.toUpperCase());
    return key ? unitAreas[key] : null;
  };

  // Engines' ov(): an override applies only when the piece is active and its amount is a valid number ≥ 0
  // (explicit 0 included). A label-only override renames the line and keeps the computed price.
  const ov = (k: string, calc: number, active: boolean): { amount: number; overridden: boolean } => {
    const o = overrides[k];
    if (!active || !o || !filled(o.amount)) return { amount: calc, overridden: false };
    const a = Number(o.amount);
    return Number.isNaN(a) || a < 0 ? { amount: calc, overridden: false } : { amount: a, overridden: true };
  };
  const ovLabel = (k: string): string | null => text(overrides[k]?.label);

  const drafts: Draft[] = [];
  const push = (d: Partial<Draft> & Pick<Draft, 'section' | 'location' | 'label' | 'unit' | 'pricing_mode' | 'status'>) => {
    const line: Draft = {
      section: d.section,
      location: toBuyerWording(d.location),
      label: toBuyerWording(d.label),
      product_name: d.product_name ?? null,
      product_colour: d.product_colour ?? null,
      material_key: d.material_key ?? null,
      quantity: d.quantity ?? null,
      unit: d.unit,
      unit_price: d.unit_price == null ? null : norm(d.unit_price),
      amount: d.amount == null ? null : norm(d.amount),
      pricing_mode: d.pricing_mode,
      price_source_ref: d.price_source_ref ?? null,
      status: d.status,
      client_visible: d.client_visible ?? true,
      client_note: d.client_note ?? null,
      internal_note: d.internal_note ?? null,
      source: d.source ?? genSource,
      flagged_to: null,
      provisional: d.provisional ?? false,
      wizard_field: d.wizard_field ?? null,
    };
    if (input.submissionId) line.submission_id = input.submissionId;
    drafts.push(line);
  };
  /** A priced piece: catalog/flat-rate unless an amount override applied (then manual, ref override:<key>). */
  const priced = (
    o: { amount: number; overridden: boolean }, key: string,
    d: Partial<Draft> & Pick<Draft, 'section' | 'location' | 'label' | 'unit' | 'pricing_mode'>,
  ) => {
    if (!(o.amount > 0) && !o.overridden) return; // engines list only amounts > 0
    if (o.overridden && o.amount === 0) {
      // Controller ruling: an office $0 override is an inclusion, never a "$0 upgrade"; the ref keeps the audit trail.
      push({ ...d, label: ovLabel(key) || d.label, amount: 0, unit_price: null, status: 'included',
        pricing_mode: 'included', price_source_ref: `override:${key}` });
      return;
    }
    push({
      ...d,
      label: ovLabel(key) || d.label,
      amount: o.amount,
      status: 'upgrade',
      ...(o.overridden ? { pricing_mode: 'manual' as const, price_source_ref: `override:${key}`, unit_price: null } : {}),
    });
  };

  // ---- Unit resolution (client engine's resolveUnitCode) ----
  const normalized = normalizeUnitTypeCode(input.unitTypeCode);
  let resolvedCode: string | null = null;
  if (normalized) {
    const upper = normalized.toUpperCase();
    resolvedCode = upper;
    if (!upper.includes('-') && (upper === 'G' || upper === 'H')) {
      const floor = s.upgradeFloorSelection;
      if (floor) resolvedCode = `${upper}-${floor}`;
      else if (areaFor(`${upper}-1`)) resolvedCode = `${upper}-1`;
      else if (areaFor(`${upper}-2`)) resolvedCode = `${upper}-2`;
    }
  }
  const unitData = resolvedCode ? areaFor(resolvedCode) : null;
  const areaUpgrades: QuoteAreaUpgrade[] = (Array.isArray(s.areaUpgrades) ? s.areaUpgrades : []).filter((a) => a && typeof a === 'object');
  const heatedFloorPrice = cfg('heated_floor_per_bathroom');
  const sectionHeatedFloorCount = Number(s.heatedFloorBathrooms) || 0;
  const bedroomChoice = s.bedroomFlooringChoice || '';

  // ---- Standard inclusions (base spec) ----
  // An office "included" window-like item for a room replaces the base-spec shade line for that room.
  const officeIncludedShadeRooms = new Set(customItems
    .filter((i) => i && i.status === 'included' && WINDOW_LIKE.test(String(i.label || '')))
    .map((i) => toBuyerWording(String(i.area || '').trim())).filter(Boolean));
  const spec: QuoteBaseSpecRow[] = Array.isArray(input.baseSpec) ? input.baseSpec : [];
  const mainLivingOptions = spec.find((r) => r && r.location === 'Main Living')?.defaultColourOptions;
  for (const row of spec) {
    if (!row) continue;
    if (!row.isIncluded) {
      push({ section: (SECTION_ORDER as readonly string[]).includes(row.section) ? row.section as Section : 'other',
        location: row.location, label: row.label, product_name: row.defaultProduct, unit: 'flat',
        pricing_mode: 'manual', status: 'deferred', amount: null });
      continue;
    }
    const isShade = row.section === 'window_coverings';
    if (isShade && officeIncludedShadeRooms.has(toBuyerWording(row.location))) continue;
    let product = row.defaultProduct;
    let colour: string | null = null;
    let field: string | null = null;
    if (row.location === 'Main Living') { colour = colourText(s.lvpColour, row.defaultColourOptions, input.colourNames); field = 'lvp_colour'; }
    else if (row.section === 'tile') { colour = colourText(s.spcTileColour, row.defaultColourOptions, input.colourNames); field = 'spc_tile_colour'; }
    else if (row.section === 'stairs') { colour = colourText(s.stairCarpetColour, row.defaultColourOptions, input.colourNames); field = 'stair_carpet_colour'; }
    else if (row.section === 'backsplash') { field = 'backsplash_orientation'; }
    else if (row.section === 'flooring' && /Bedroom/.test(row.location)) {
      field = 'bedroom_flooring_choice';
      if (bedroomChoice === 'carpet') { product = BEDROOM_CARPET_PRODUCT; colour = colourText(s.bedroomCarpetColour, row.defaultColourOptions, input.colourNames); }
      else if (bedroomChoice === 'lvp') {
        product = BEDROOM_LVP_PRODUCT;
        colour = colourText(s.bedroomLvpSameAsMain ? s.lvpColour : s.bedroomLvpColour, mainLivingOptions, input.colourNames);
      }
    }
    const note = field ? provisional[field] : undefined;
    push({
      section: isShade ? 'window_coverings' : 'standard', location: row.location, label: row.label,
      product_name: product, product_colour: colour, quantity: isShade ? 1 : null, unit: isShade ? 'each' : 'flat',
      unit_price: 0, amount: 0, pricing_mode: 'included', status: 'included', wizard_field: field,
      provisional: !!note, client_note: note ? String(note) : null,
    });
  }

  // ---- Stairs (engines: isStairLvp is the selection, evaluated before any override) ----
  const isPremiumStairLvp = s.stairUpgradeType === 'premium_lvp';
  const isStairLvp = isPremiumStairLvp || s.stairUpgradeType === 'lvp' || !!s.stairLvpUpgradeSelected;
  if (isStairLvp) {
    const premium = cfg('stair_premium_lvp_upgrade_price');
    const usePremium = isPremiumStairLvp && premium > 0;
    const price = isPremiumStairLvp ? (premium || cfg('stair_lvp_upgrade_price') || 0) : cfg('stair_lvp_upgrade_price');
    priced(ov('stair', price, true), 'stair', {
      section: 'stairs', location: STAIRS_LOWER,
      label: isPremiumStairLvp ? 'Premium LVP with Custom Stair Nosings' : 'LVP with Custom Stair Nosings',
      quantity: 1, unit: 'flat', unit_price: price, pricing_mode: 'flat_rate',
      price_source_ref: usePremium ? 'config:stair_premium_lvp_upgrade_price' : 'config:stair_lvp_upgrade_price',
      wizard_field: 'stair_upgrade_type',
    });
  }
  const stairCarpetActive = !!s.stairPremiumCarpetSelected && !isStairLvp;
  const stairCarpetPrice = cfg('premium_carpet_stairs_price');
  priced(ov('stairCarpet', stairCarpetActive ? stairCarpetPrice : 0, stairCarpetActive), 'stairCarpet', {
    section: 'stairs', location: STAIRS_LOWER, label: 'Premium carpet', product_colour: colourText(s.stairCarpetColour, undefined, input.colourNames),
    quantity: 1, unit: 'flat', unit_price: stairCarpetPrice, pricing_mode: 'flat_rate',
    price_source_ref: 'config:premium_carpet_stairs_price', wizard_field: 'stair_premium_carpet_selected',
  });
  const stairUnderpadActive = !!s.premiumUnderpadStairs && !isStairLvp;
  const stairUnderpadPrice = cfg('premium_underpad_stairs_price');
  priced(ov('stairUnderpad', stairUnderpadActive ? stairUnderpadPrice : 0, stairUnderpadActive), 'stairUnderpad', {
    section: 'stairs', location: STAIRS_LOWER, label: 'Premium underpad',
    quantity: 1, unit: 'flat', unit_price: stairUnderpadPrice, pricing_mode: 'flat_rate',
    price_source_ref: 'config:premium_underpad_stairs_price', wizard_field: 'premium_underpad_stairs',
  });

  // ---- Bedroom premium carpet / underpad (carpet bedrooms only; hard-surface second bedroom excluded) ----
  const secondBedroomIsHard = areaUpgrades.some((a) => a.areaId === 'secondBedroom' && /lvp|lvt|laminate|hardwood|tile/i.test(String(a.materialType)));
  const bedroomIsCarpet = bedroomChoice === 'carpet';
  const unitBase = (normalized || '').toUpperCase().split('-')[0];
  // Split-floor units G/H keep every bedroom on the 2nd floor, whatever floor the upgrades are on.
  const bedroomUnitData = unitBase === 'G' || unitBase === 'H' ? areaFor(`${unitBase}-2`) : unitData;
  const bedroomCarpetSqyd = bedroomIsCarpet
    ? (bedroomUnitData?.masterBedroom || 0) + (secondBedroomIsHard ? 0 : (bedroomUnitData?.secondBedroomCarpet || 0)) : 0;
  const bedroomLocation = secondBedroomIsHard ? 'Primary Bedroom' : 'Bedrooms';
  const bedroomPiece = (key: 'bedroomCarpet' | 'bedroomUnderpad', flag: boolean | undefined, material: string, label: string, field: string) => {
    const active = bedroomIsCarpet && !!flag;
    const cost = mat(material);
    priced(ov(key, active ? bedroomCarpetSqyd * cost * (1 + m) : 0, active), key, {
      section: 'flooring', location: bedroomLocation, label, product_colour: colourText(s.bedroomCarpetColour, undefined, input.colourNames),
      material_key: material, quantity: bedroomCarpetSqyd, unit: 'sqyd', unit_price: cost * (1 + m),
      pricing_mode: 'catalog', price_source_ref: `material:${material}`, wizard_field: field,
    });
  };
  bedroomPiece('bedroomCarpet', s.premiumCarpetBedroom, 'carpet', 'Premium carpet', 'premium_carpet_bedroom');
  bedroomPiece('bedroomUnderpad', s.premiumUnderpadBedroom, 'premium_carpet_underpad', 'Premium underpad', 'premium_underpad_bedroom');

  // ---- Grout ----
  if (s.backsplashGrout?.enabled) {
    const fee = cfg('grout_color_change_price');
    priced(ov('grout', fee, true), 'grout', {
      section: 'backsplash', location: 'Kitchen', label: 'Custom grout colour', product_colour: text(s.backsplashGrout.groutColor),
      quantity: 1, unit: 'flat', unit_price: fee, pricing_mode: 'flat_rate',
      price_source_ref: 'config:grout_color_change_price', wizard_field: 'backsplash_grout_enabled',
    });
  }

  // ---- Window coverings: one line per opening, one Somfy motorization line per motorized opening ----
  const aw = cfg('additional_window_price');
  const pd = cfg('patio_door_price');
  const am = cfg('automated_motor_price');
  // Quantities are clamped (this runs in the buyer's browser); anything above the cap becomes one review line.
  const rawAq = Number(s.additionalWindowsQty) || 0;
  const rawPq = Number(s.patioDoorsQty) || 0;
  const rawMq = Number(s.automatedWindowsQty) || 0;
  const aq = Math.min(rawAq, MAX_WINDOW_QTY);
  const pq = Math.min(rawPq, MAX_WINDOW_QTY);
  const mq = Math.min(rawMq, MAX_WINDOW_QTY);
  const windowLoc = (i: number) => (aq > 1 ? `Additional Window ${i}` : 'Additional Window');
  const patioLoc = (i: number) => (pq > 1 ? `Patio Door ${i}` : 'Patio Door');
  const opening = (location: string, label: string, product: string | null, price: number, key: string, field: string) => push({
    section: 'window_coverings', location, label, product_name: product, quantity: 1, unit: 'each',
    unit_price: price, amount: price, pricing_mode: 'flat_rate', price_source_ref: `config:${key}`, status: 'upgrade', wizard_field: field,
  });
  const located = Array.isArray(input.windows) ? input.windows.filter((w) => w && typeof w === 'object') : null;
  const lc = located ? windowCounts(located) : null;
  const useLocated = !!located && located.length > 0 && !!lc && lc.additionalWindowsQty === rawAq && lc.patioDoorsQty === rawPq
    && lc.automatedWindowsQty === rawMq && rawAq <= MAX_WINDOW_QTY && rawPq <= MAX_WINDOW_QTY && rawMq <= MAX_WINDOW_QTY;
  if (useLocated && located) {
    // One opening line per row, then its Somfy line; same prices and counts as the integer path below.
    let wn = 0; let pn = 0; let on = 0;
    for (const w of located) {
      const typed = toBuyerWording(String(w.location || '').trim());
      let loc: string;
      if (w.kind === 'panel_track') {
        pn++;
        loc = typed || patioLoc(pn);
        if (pd > 0) opening(loc, 'Patio door panel track', WINDOW_KIND_PRODUCTS.panel_track, pd, 'patio_door_price', 'patio_doors_qty');
      } else if (w.kind === 'included') {
        on++;
        loc = typed || `Motorized Opening ${on}`;
      } else {
        wn++;
        loc = typed || windowLoc(wn);
        if (aw > 0) {
          opening(loc, 'Additional window covering', WINDOW_KIND_PRODUCTS[w.kind] || WINDOW_KIND_PRODUCTS.roller_5,
            aw, 'additional_window_price', 'additional_windows_qty');
        }
      }
      if (w.motorized && am > 0) {
        opening(loc, 'Somfy motorization', 'Somfy motor, hub, programming & installation', am, 'automated_motor_price', 'automated_windows_qty');
      }
    }
  } else {
    if (aw > 0) for (let i = 1; i <= aq; i++) opening(windowLoc(i), 'Additional window covering', null, aw, 'additional_window_price', 'additional_windows_qty');
    if (pd > 0) for (let i = 1; i <= pq; i++) opening(patioLoc(i), 'Patio door panel track', 'Panel track', pd, 'patio_door_price', 'patio_doors_qty');
    if (am > 0) {
      for (let k = 1; k <= mq; k++) {
        const loc = k <= pq ? patioLoc(k) : k - pq <= aq ? windowLoc(k - pq) : `Motorized Opening ${k}`;
        opening(loc, 'Somfy motorization', 'Somfy motor, hub, programming & installation', am, 'automated_motor_price', 'automated_windows_qty');
      }
    }
  }
  if (rawAq > MAX_WINDOW_QTY || rawPq > MAX_WINDOW_QTY || rawMq > MAX_WINDOW_QTY) {
    push({
      section: 'window_coverings', location: 'Window coverings', label: 'Window coverings — quantity needs review',
      unit: 'each', amount: null, pricing_mode: 'manual', status: 'under_review', client_visible: true,
      internal_note: `Quantities above ${MAX_WINDOW_QTY} not itemised: additional_windows_qty=${rawAq}, patio_doors_qty=${rawPq}, automated_windows_qty=${rawMq}`,
      wizard_field: 'window_quantities',
    });
  }

  // ---- Flooring & tile area upgrades ----
  for (const sel of areaUpgrades) {
    if (!sel) continue;
    const manual = Number(sel.manualPrice) || 0;
    // Stair rows are priced by the stair flat rates; only an office manual price adds to the total.
    if (sel.areaId === 'stairs' && !(manual > 0)) continue;
    const mt = String(sel.materialType || '');
    const fieldName = AREA_FIELD_MAP[sel.areaId] || sel.areaId;
    const qty = unitData ? Number(unitData[fieldName]) || 0 : 0;
    const cost = mat(mt);
    const base = qty * cost;
    const amount = manual > 0 ? manual : base * (1 + m);
    const section: Section = sel.areaId === 'stairs' ? 'stairs'
      : sel.areaId === 'backsplash' ? 'backsplash'
      : sel.areaId === 'guestBathroom' || sel.areaId === 'masterEnsuite' || isTile(mt) ? 'tile'
      : 'flooring';
    const location = text(sel.areaLabel) || AREA_LOCATIONS[sel.areaId] || text(sel.areaId) || 'General';
    const field = `area_upgrades[${sel.areaId}]`;
    // The client engine lists every area row, $0 included; the server only rows > 0. Lines follow the client.
    push({
      section, location, label: MATERIAL_NAMES[mt] || mt || 'Upgrade',
      product_name: text(sel.productName), product_colour: text(sel.productColor), material_key: mt || null,
      quantity: qty > 0 ? qty : null, unit: SQYD_AREAS.has(sel.areaId) ? 'sqyd' : 'sqft',
      unit_price: manual > 0 ? null : cost * (1 + m), amount,
      pricing_mode: manual > 0 ? 'manual' : 'catalog',
      price_source_ref: manual > 0 ? `manual:${field}` : mt ? `material:${mt}` : null,
      status: 'upgrade', client_note: text(sel.clientComment),
      internal_note: joinNotes(sel.comments, sel.manualPriceNote), wizard_field: field,
    });
    if (!!sel.heatedFloor && sectionHeatedFloorCount === 0 && isTile(mt) && heatedFloorPrice > 0) {
      push({
        section: 'bathroom', location, label: 'Heated floor', quantity: 1, unit: 'each',
        unit_price: heatedFloorPrice, amount: heatedFloorPrice, pricing_mode: 'flat_rate',
        price_source_ref: 'config:heated_floor_per_bathroom', status: 'upgrade', wizard_field: `${field}.heatedFloor`,
      });
    }
  }

  // ---- Bathroom upgrades (Section 4) ----
  const hasPricedBathroomTileAreas = areaUpgrades.some((a) => a && (a.areaId === 'guestBathroom' || a.areaId === 'masterEnsuite') && isTile(a.materialType));
  const tileCost = mat('tile');
  let guestArea = 0; let ensuiteArea = 0;
  if (resolvedCode) {
    const code = resolvedCode.toUpperCase();
    if (code === 'G' || code === 'H') {
      const d1 = areaFor(`${code}-1`); const d2 = areaFor(`${code}-2`);
      guestArea = Math.max(d1?.guestBathroom || 0, d2?.guestBathroom || 0);
      ensuiteArea = Math.max(d1?.masterEnsuite || 0, d2?.masterEnsuite || 0);
    } else {
      const a = areaFor(code);
      guestArea = a?.guestBathroom || 0; ensuiteArea = a?.masterEnsuite || 0;
    }
  }
  // Legacy rows with neither sub-flag default to both bathrooms (engine rule).
  const subFlagsProvided = s.bathroomTileEnsuiteSelected !== undefined || s.bathroomTileGuestSelected !== undefined;
  const ensuiteOn = subFlagsProvided ? !!s.bathroomTileEnsuiteSelected : !!s.bathroomTileSelected;
  const guestOn = subFlagsProvided ? !!s.bathroomTileGuestSelected : !!s.bathroomTileSelected;
  const masterOn = !!s.bathroomTileSelected || ensuiteOn || guestOn;
  let tileCalc = 0; let tileSqft = 0; let ensuiteSqft = 0; let guestSqft = 0;
  if (masterOn && !hasPricedBathroomTileAreas && tileCost > 0) {
    ensuiteSqft = ensuiteOn ? ensuiteArea : 0;
    guestSqft = guestOn && guestArea > 0 ? guestArea : 0;
    tileSqft = ensuiteSqft + guestSqft;
    tileCalc = tileSqft * tileCost * (1 + m);
  }
  const tileLocation = guestSqft > 0 && ensuiteSqft > 0 ? 'Main Bathroom & Primary Ensuite'
    : guestSqft > 0 ? 'Main Bathroom' : ensuiteSqft > 0 ? 'Primary Ensuite' : 'Bathrooms';
  priced(ov('bathroomTile', tileCalc, masterOn && !hasPricedBathroomTileAreas), 'bathroomTile', {
    section: 'tile', location: tileLocation, label: 'Porcelain tile floor upgrade', material_key: 'tile',
    quantity: tileSqft > 0 ? tileSqft : null, unit: 'sqft', unit_price: tileCost * (1 + m),
    pricing_mode: 'catalog', price_source_ref: 'material:tile', wizard_field: 'bathroom_tile_selected',
  });
  const n = sectionHeatedFloorCount;
  priced(ov('heatedFloor', n > 0 ? n * heatedFloorPrice : 0, n > 0), 'heatedFloor', {
    section: 'bathroom', location: n > 1 ? 'Bathrooms' : 'Bathroom', label: 'Heated tile floor',
    quantity: n > 0 ? n : null, unit: 'each', unit_price: heatedFloorPrice, pricing_mode: 'flat_rate',
    price_source_ref: 'config:heated_floor_per_bathroom', wizard_field: 'heated_floor_bathrooms',
  });
  const showerCost = mat('tiled_shower');
  priced(ov('customShower', s.customTiledShower && showerCost > 0 ? showerCost * (1 + m) : 0, !!s.customTiledShower), 'customShower', {
    section: 'bathroom', location: 'Shower', label: 'Custom tiled shower', material_key: 'tiled_shower',
    quantity: 1, unit: 'flat', unit_price: showerCost * (1 + m), pricing_mode: 'catalog',
    price_source_ref: 'material:tiled_shower', wizard_field: 'custom_tiled_shower',
  });

  // ---- Office custom items (custom_pricing.customItems) ----
  customItems.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const q = Number(item.quantity); const u = Number(item.unitPrice);
    const byQty = q > 0 && !!u;
    // Engine rules: customItemAmount() and the uncommitted-items `hasPrice` test.
    const hasPrice = (q > 0 && filled(item.unitPrice)) || filled(item.amount);
    const amt = byQty ? q * u : Number(item.amount) || 0;
    const raw = item.status || 'upgrade';
    let status: LineStatus; let amount: number | null;
    if (raw === 'included') { status = 'included'; amount = 0; }
    else if (raw === 'upgrade') { status = hasPrice ? 'upgrade' : 'pending'; amount = hasPrice ? amt : null; }
    else if (raw === 'pending') { status = 'pending'; amount = null; }
    else if (raw === 'deferred') { status = 'deferred'; amount = hasPrice ? amt : null; }
    else { status = 'under_review'; amount = hasPrice ? amt : null; } // 'disputed' and any unknown status (never 'removed')
    const key = String(item.catalogKey || '');
    const pricingMode: PricingMode = status === 'included' ? 'included'
      : key.startsWith('mat:') ? 'catalog' : key.startsWith('cfg:') ? 'flat_rate' : 'manual';
    push({
      section: officeSection(item, status === 'included'), location: text(item.area) || 'General',
      label: text(item.label) || 'Custom Item', material_key: key.startsWith('mat:') ? key.slice(4) : null,
      quantity: q > 0 ? q : null, unit: officeUnit(item.unit, q > 0), unit_price: byQty ? u : null, amount,
      pricing_mode: pricingMode,
      price_source_ref: key.startsWith('mat:') ? `material:${key.slice(4)}` : key.startsWith('cfg:') ? `config:${key.slice(4)}` : `custom:${item.id || idx}`,
      status, client_note: text(item.detail),
      internal_note: joinNotes(item.note, raw === 'upgrade' && !hasPrice ? 'Office line has no price yet' : null),
      source: 'office', wizard_field: `custom_pricing.customItems[${item.id || idx}]`,
    });
  });

  // ---- Deterministic order: section order, then insertion ----
  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => SECTION_ORDER.indexOf(a.d.section) - SECTION_ORDER.indexOf(b.d.section) || a.i - b.i)
    .map(({ d }, i) => ({ ...d, sort_order: (i + 1) * 10 }));
}

// DB numeric columns (quantity, unit_price, amount) must stay unconstrained: lines keep full precision and
// renderers round only for display, so these sums equal the engines to the cent.
/** Mirrors the DB generated column: counted iff status = 'upgrade' and amount is not null. */
export const countsInTotal = (l: Pick<QuoteLine, 'status' | 'amount'>): boolean => l.status === 'upgrade' && l.amount != null;

export function sumQuoteLines(lines: QuoteLine[], gstRate: number): {
  upgrades: number; windowCoverings: number; subtotal: number; gst: number; total: number; notInTotal: QuoteLine[];
} {
  let upgrades = 0; let windowCoverings = 0;
  const notInTotal: QuoteLine[] = [];
  for (const l of lines) {
    if (l.status === 'removed') continue;
    if (countsInTotal(l)) {
      if (l.section === 'window_coverings') windowCoverings += l.amount as number; else upgrades += l.amount as number;
    } else if (l.status !== 'included') notInTotal.push(l);
  }
  const subtotal = upgrades + windowCoverings;
  const gst = subtotal * gstRate;
  return { upgrades, windowCoverings, subtotal, gst, total: subtotal + gst, notInTotal };
}
