// The ONE mapping from a `buyer_selections` row to `GenerateInput` (Phase 2 Task 9). Used by the wizard (via
// src/lib/generateInputFromSelections.ts), by send-selections-email after the insert, by the backfill and by the
// parity tests, so lines generated in the browser, on the server and in the harness cannot drift.
// Field rules mirror toBuyerPdfSelections (src/lib/buyerPdfSelections.ts) for every field the generator reads;
// scripts/wizard-lines.test.ts proves the lines are identical on every fixture.
// Dependency-free apart from ./quoteLines.ts and ./optionNames.ts (runs under Deno, bun and Vite).
import {
  normalizeUnitTypeCode, type GenerateInput, type QuoteAreaUpgrade, type QuoteBaseSpecRow, type QuotePricing,
  type QuoteSelections, type QuoteWindow,
} from './quoteLines.ts';
import { COLOUR_NAMES } from './optionNames.ts';

// deno-lint-ignore no-explicit-any
export type BuyerSelectionsRowLike = Record<string, any>;

export const unitTypeCodeOfRow = (row: BuyerSelectionsRowLike): string | null =>
  row && row.unit_type ? normalizeUnitTypeCode(String(row.unit_type)) : null;

export function quoteSelectionsFromRow(s: BuyerSelectionsRowLike): QuoteSelections {
  const stairType = s.stair_upgrade_type || (s.stair_lvp_upgrade_selected ? 'lvp' : 'standard');
  return {
    // Internal area `comments` never reach lines generated from a row (same as toBuyerPdfSelections).
    areaUpgrades: (Array.isArray(s.area_upgrades) ? s.area_upgrades : []).map((u: unknown) => {
      const { comments: _internal, ...safe } = (u && typeof u === 'object' ? u : {}) as Record<string, unknown>;
      return { ...safe, comments: '' } as unknown as QuoteAreaUpgrade;
    }),
    upgradeFloorSelection: s.upgrade_floor_selection === '1' || s.upgrade_floor_selection === '2' ? s.upgrade_floor_selection : null,
    backsplashGrout: { enabled: !!s.backsplash_grout_enabled, groutColor: s.backsplash_grout_color || '', comments: s.backsplash_grout_comments || '' },
    stairUpgradeType: stairType,
    stairLvpUpgradeSelected: stairType === 'lvp' || stairType === 'premium_lvp' || !!s.stair_lvp_upgrade_selected,
    stairPremiumCarpetSelected: !!s.stair_premium_carpet_selected,
    premiumUnderpadStairs: !!s.premium_underpad_stairs,
    bedroomFlooringChoice: s.bedroom_flooring_choice === 'lvp' ? 'lvp' : s.bedroom_flooring_choice === 'carpet' ? 'carpet' : '',
    premiumCarpetBedroom: !!s.premium_carpet_bedroom,
    premiumCarpetBedroomStyle: s.premium_carpet_bedroom_style || null,
    premiumCarpetBedroomColour: s.premium_carpet_bedroom_colour || null,
    stairPremiumCarpetStyle: s.stair_premium_carpet_style || null,
    stairPremiumCarpetColour: s.stair_premium_carpet_colour || null,
    premiumUnderpadBedroom: !!s.premium_underpad_bedroom,
    additionalWindowsQty: s.additional_windows_qty || 0,
    patioDoorsQty: s.patio_doors_qty || 0,
    automatedWindowsQty: s.automated_windows_qty || 0,
    bathroomTileSelected: !!s.bathroom_tile_selected,
    bathroomTileEnsuiteSelected: !!s.bathroom_tile_ensuite_selected,
    bathroomTileGuestSelected: !!s.bathroom_tile_guest_selected,
    heatedFloorBathrooms: s.heated_floor_bathrooms || 0,
    customTiledShower: !!s.custom_tiled_shower,
    customPricing: s.custom_pricing,
    lvpColour: s.lvp_colour || '',
    spcTileColour: s.spc_tile_colour || '',
    stairCarpetColour: s.stair_carpet_colour || '',
    bedroomCarpetColour: s.bedroom_carpet_colour || '',
    bedroomLvpColour: s.bedroom_lvp_colour || '',
    bedroomLvpSameAsMain: !!s.bedroom_lvp_same_as_main,
    backsplashOrientation: s.backsplash_orientation || '',
  };
}

export interface GenerateInputOptions {
  source?: 'wizard' | 'migration';
  windows?: QuoteWindow[] | null;
  submissionId?: string;
}

/** Row → GenerateInput. The caller passes the base spec for the row's unit type (baseSpecFor / baseSpecForCode). */
export function generateInputFromRowCore(
  row: BuyerSelectionsRowLike, pricing: QuotePricing, baseSpec: QuoteBaseSpecRow[], opts: GenerateInputOptions = {},
): GenerateInput {
  const input: GenerateInput = {
    selections: quoteSelectionsFromRow(row),
    unitTypeCode: unitTypeCodeOfRow(row),
    pricing,
    baseSpec,
    // Colour ids → names, so stored lines, the wizard rail, the email path and the backfill all print names.
    colourNames: COLOUR_NAMES,
  };
  if (opts.source) input.source = opts.source;
  if (opts.windows) input.windows = opts.windows;
  if (opts.submissionId) input.submissionId = opts.submissionId;
  return input;
}
