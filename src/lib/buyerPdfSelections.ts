import type { Tables } from '@/integrations/supabase/types';
import type { BuyerSelections } from '@/lib/buyerPdfGenerator';

// Explicit allow-list: internal notes and comments never cross this boundary.
export function toBuyerPdfSelections(s: Tables<'buyer_selections'>): BuyerSelections {
  const stairType = s.stair_upgrade_type || (s.stair_lvp_upgrade_selected ? 'lvp' : 'standard');
  return {
    unitNumber: s.unit_number, firstName: s.first_name, lastName: s.last_name,
    phoneNumber: s.phone_number || '', email: s.email,
    estimatedPossessionDate: s.estimated_possession_date || '', hasStairs: !!s.has_stairs,
    lvpColour: s.lvp_colour || '', spcTileColour: s.spc_tile_colour || '',
    backsplashOrientation: s.backsplash_orientation || '', stairCarpetColour: s.stair_carpet_colour || '',
    bedroomFlooringChoice: s.bedroom_flooring_choice === 'lvp' ? 'lvp' : s.bedroom_flooring_choice === 'carpet' ? 'carpet' : '',
    bedroomCarpetColour: s.bedroom_carpet_colour || '', bedroomLvpColour: s.bedroom_lvp_colour || '',
    bedroomLvpSameAsMain: !!s.bedroom_lvp_same_as_main,
    additionalWindowsQty: s.additional_windows_qty || 0, patioDoorsQty: s.patio_doors_qty || 0,
    automatedWindowsQty: s.automated_windows_qty || 0,
    lvpComments: s.lvp_comments || '', spcTileComments: s.spc_tile_comments || '',
    windowComments: s.window_comments || '', upgradeComments: s.upgrade_comments || '',
    upgradeInterestsNotes: s.upgrade_interests_notes || '',
    // Internal `comments` never cross this boundary; staff outputs read them from the raw row instead.
    areaUpgrades: (Array.isArray(s.area_upgrades) ? s.area_upgrades : []).map((u) => {
      const { comments: _internal, ...safe } = (u && typeof u === 'object' ? u : {}) as Record<string, unknown>;
      return { ...safe, comments: '' };
    }) as unknown as BuyerSelections['areaUpgrades'],
    upgradeFloorSelection: s.upgrade_floor_selection === '1' || s.upgrade_floor_selection === '2' ? s.upgrade_floor_selection : null,
    backsplashGrout: { enabled: !!s.backsplash_grout_enabled, groutColor: s.backsplash_grout_color || '', comments: s.backsplash_grout_comments || '' },
    bathroomTileSelected: !!s.bathroom_tile_selected, bathroomTileEnsuiteSelected: !!s.bathroom_tile_ensuite_selected,
    bathroomTileGuestSelected: !!s.bathroom_tile_guest_selected, heatedFloorBathrooms: s.heated_floor_bathrooms || 0,
    customTiledShower: !!s.custom_tiled_shower, customPricing: (s as any).custom_pricing, stairUpgradeType: stairType,
    stairLvpUpgradeSelected: stairType === 'lvp' || stairType === 'premium_lvp' || !!s.stair_lvp_upgrade_selected,
    stairPremiumCarpetSelected: !!s.stair_premium_carpet_selected,
    premiumCarpetBedroom: !!s.premium_carpet_bedroom, premiumUnderpadBedroom: !!s.premium_underpad_bedroom,
    premiumUnderpadStairs: !!s.premium_underpad_stairs, hardwoodUpgradeSelected: !!s.hardwood_upgrade_selected,
    documentUploads: Array.isArray(s.document_uploads) ? s.document_uploads : [],
    upgradeInterests: (s.upgrade_interests || {}) as Record<string, boolean>,
  };
}