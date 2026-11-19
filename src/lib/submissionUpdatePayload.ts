import type { Json, TablesUpdate } from '@/integrations/supabase/types';

// Area upgrade interface
export interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string; // internal
  clientComment?: string; // printed on buyer outputs
  heatedFloor?: boolean;
  areaLabel?: string;
  manualPrice?: number | null;
  manualPriceNote?: string;
}


// Submission interface matching the database schema
export interface SubmissionEditState {
  id: string;
  created_at: string;
  updated_at: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string;
  estimated_possession_date: string | null;
  has_stairs: boolean;
  lvp_colour: string | null;
  lvp_comments: string | null;
  spc_tile_colour: string | null;
  spc_tile_comments: string | null;
  backsplash_orientation: string | null;
  stair_carpet_colour: string | null;
  stair_lvp_upgrade_selected?: boolean;
  stair_upgrade_type?: string | null;
  stair_premium_carpet_selected?: boolean;
  premium_underpad_stairs?: boolean;
  premium_carpet_bedroom?: boolean;
  premium_underpad_bedroom?: boolean;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean;
  additional_windows_qty: number;
  patio_doors_qty: number;
  window_comments?: string | null;
  upgrade_interests: Record<string, boolean>;
  status: string;
  sales_comments: string | null;
  area_upgrades?: AreaUpgrade[];
  upgrade_floor_selection?: string | null;
  backsplash_grout_enabled?: boolean;
  backsplash_grout_color?: string | null;
  backsplash_grout_comments?: string | null;
  heated_floor_bathrooms?: number;
  automated_windows_qty?: number;
  custom_tiled_shower?: boolean | null;
  bathroom_tile_ensuite_selected?: boolean | null;
  bathroom_tile_guest_selected?: boolean | null;
  admin_notes?: string | null;
  bathroom_tile_selected?: boolean;
  hardwood_upgrade_selected?: boolean;
  custom_pricing?: unknown;
}


/** Heated floors are only charged on tile rows (see upgradeTotals hasHeat). */
export function countHeatedTileRows(areaUpgrades: AreaUpgrade[] | undefined): number {
  return (areaUpgrades || []).filter(
    u => !!u.heatedFloor && /^(tile|nonstandard_tile)$/.test(String(u.materialType))
  ).length;
}

/**
 * Pure builder for the staff editor's buyer_selections update. No React, no Supabase.
 * - heated_floor_bathrooms = max(staff input, count of area rows flagged heatedFloor), so the
 *   saved value never drops below either source (the buyer's Section-4 count is preserved).
 * - area_upgrades rows keep every key (areaLabel included); only manualPrice,
 *   heatedFloor and manualPriceNote are normalised.
 * - Stair upgrade flags are forced off when the unit has no stairs.
 */
/**
 * Columns that change what the old engines price (or office pricing itself). The meeting console's "Edit buyer
 * details" dialog never writes them: quote lines own pricing there, `custom_pricing` is admin-guarded
 * (`guard_custom_pricing`), and a stale dialog snapshot must not overwrite a newer edit.
 */
export const PRICING_FIELDS = [
  'custom_pricing', 'unit_type', 'has_stairs', 'bedroom_flooring_choice', 'premium_carpet_bedroom', 'premium_underpad_bedroom',
  'stair_lvp_upgrade_selected', 'stair_upgrade_type', 'stair_premium_carpet_selected', 'premium_underpad_stairs',
  'backsplash_grout_enabled', 'additional_windows_qty', 'patio_doors_qty', 'automated_windows_qty', 'area_upgrades',
  'upgrade_floor_selection', 'heated_floor_bathrooms', 'custom_tiled_shower', 'bathroom_tile_ensuite_selected',
  'bathroom_tile_guest_selected',
] as const;
export type PricingField = (typeof PRICING_FIELDS)[number];
export const isPricingField = (key: string): key is PricingField => (PRICING_FIELDS as readonly string[]).includes(key);

export function buildSubmissionUpdatePayload(
  editData: SubmissionEditState, opts: { buyerDetailsOnly?: boolean } = {},
): TablesUpdate<'buyer_selections'> {
  const full = buildFullPayload(editData);
  if (!opts.buyerDetailsOnly) return full;
  const out: Record<string, unknown> = { ...full };
  for (const k of PRICING_FIELDS) delete out[k];
  return out as TablesUpdate<'buyer_selections'>;
}

function buildFullPayload(editData: SubmissionEditState): TablesUpdate<'buyer_selections'> {
  const areaUpgradesJson = (editData.area_upgrades || []).map(upgrade => ({
    ...upgrade,
    heatedFloor: upgrade.heatedFloor || false,
    manualPrice: Number(upgrade.manualPrice) > 0 ? Number(upgrade.manualPrice) : null,
    manualPriceNote: upgrade.manualPriceNote || '',
  }));

  const heatedAreaCount = countHeatedTileRows(editData.area_upgrades);

  return {
    // Buyer Info
    first_name: editData.first_name,
    last_name: editData.last_name,
    email: editData.email,
    phone_number: editData.phone_number,
    unit_number: editData.unit_number,
    unit_type: editData.unit_type,
    estimated_possession_date: editData.estimated_possession_date,
    has_stairs: editData.has_stairs,

    // Flooring Selections
    lvp_colour: editData.lvp_colour,
    lvp_comments: editData.lvp_comments,
    spc_tile_colour: editData.spc_tile_colour,
    spc_tile_comments: editData.spc_tile_comments,

    // Bedroom Flooring
    bedroom_flooring_choice: editData.bedroom_flooring_choice,
    bedroom_carpet_colour: editData.bedroom_carpet_colour,
    bedroom_lvp_colour: editData.bedroom_lvp_colour,
    bedroom_lvp_same_as_main: editData.bedroom_lvp_same_as_main,
    // Bedroom premiums only apply to carpet bedrooms; clear both flags otherwise.
    premium_carpet_bedroom: editData.bedroom_flooring_choice === 'carpet' && !!editData.premium_carpet_bedroom,
    premium_underpad_bedroom: editData.bedroom_flooring_choice === 'carpet' && !!editData.premium_underpad_bedroom,
    stair_carpet_colour: editData.stair_carpet_colour,
    // No stairs = no stair upgrade charges (LVP nosings, premium carpet, underpad).
    stair_lvp_upgrade_selected: !!editData.has_stairs && !!editData.stair_lvp_upgrade_selected,
    stair_upgrade_type: !editData.has_stairs
      ? 'standard'
      : editData.stair_lvp_upgrade_selected
        ? ((editData.stair_upgrade_type === 'premium_lvp') ? 'premium_lvp' : 'lvp')
        : 'standard',
    stair_premium_carpet_selected: !!editData.has_stairs && !editData.stair_lvp_upgrade_selected && !!editData.stair_premium_carpet_selected,
    premium_underpad_stairs: !!editData.has_stairs && !editData.stair_lvp_upgrade_selected && !!editData.premium_underpad_stairs,

    // Backsplash
    backsplash_orientation: editData.backsplash_orientation,
    backsplash_grout_enabled: editData.backsplash_grout_enabled,
    backsplash_grout_color: editData.backsplash_grout_color,
    backsplash_grout_comments: editData.backsplash_grout_comments,

    // Window Coverings
    additional_windows_qty: editData.additional_windows_qty,
    patio_doors_qty: editData.patio_doors_qty,
    automated_windows_qty: editData.automated_windows_qty ?? 0,
    window_comments: editData.window_comments,

    // Area Upgrades - cast to Json type
    area_upgrades: areaUpgradesJson as unknown as Json,
    upgrade_floor_selection: editData.upgrade_floor_selection,
    heated_floor_bathrooms: Math.max(Number(editData.heated_floor_bathrooms) || 0, heatedAreaCount),
    custom_tiled_shower: !!editData.custom_tiled_shower,
    bathroom_tile_ensuite_selected: !!editData.bathroom_tile_ensuite_selected,
    bathroom_tile_guest_selected: !!editData.bathroom_tile_guest_selected,
    custom_pricing: (editData.custom_pricing ?? {}) as unknown as Json,

    // Admin
    sales_comments: editData.sales_comments,
    admin_notes: editData.admin_notes ?? null,
    upgrade_interests: editData.upgrade_interests as unknown as Json,
  };
}
