import { UPGRADE_MATERIALS } from '@/lib/upgradeCostData';

// Buyer-facing wording shared by the PDF, Word export and CSV. The email edge function cannot
// import from src/, so supabase/functions/send-selections-email/index.ts mirrors these constants
// (scripts/buyer-pdf-selections.test.ts checks the mirror). Change copy here and there together.

// Base spec: Luxury Vinyl Plank throughout; Dante 2.0 tile in washrooms only.
// Confirmed by Dan 2026-11-18 17:00 CT; see LAUNDRY_DEFAULT_PRODUCT in baseSpec.ts. One edit changes every renderer.
export const LAUNDRY_ROW_LABEL = 'Laundry Room';
export const LAUNDRY_STANDARD_LABEL = 'Ceratec Dante 2.0 LVT (standard)';
// Bathroom & laundry may also take a standard main-floor plank at no cost (Dan, 2026-11-26).
export const LAUNDRY_PLANK_PRODUCT = 'XL Flooring LVP';
const PLANK_NAMES: Record<string, string> = { cortland: 'Cortland', opal: 'Opal', wolfriver: 'Wolf River' };
export const BATHROOM_TILE_LABEL = 'Bathroom Tile';
export const PRIMARY_BEDROOM_FLOORING_LABEL = 'Primary Bedroom Flooring';
export const PRIMARY_BEDROOM_CARPET_COLOUR_LABEL = 'Primary Bedroom Carpet Colour';
export const STAIR_CARPET_LABEL = 'Stair Flooring – Carpet'; // en dash
export const STAIR_STANDARD_VALUE = 'Standard Carpet (Included)';

/** Buyer-facing copy only: internal ids, columns and admin labels keep their names. */
export const toBuyerWording = (s: string): string => s.replace(/Master Bedroom/g, 'Primary Bedroom');

/** Standard plank name when the shared bathroom/laundry choice (`spc_tile_colour`) is a plank, else null. */
export function plankBathChoiceName(spcTileColour: string | null | undefined): string | null {
  return PLANK_NAMES[String(spcTileColour || '').toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

/**
 * Laundry row value: the upgraded material when an area_upgrades row for laundry exists; else the standard plank when
 * the shared bathroom/laundry choice is a plank; else the standard tile label.
 */
export function laundryValue(
  areaUpgrades: ReadonlyArray<{ areaId?: string; materialType?: string; productName?: string; productColor?: string }> | null | undefined,
  spcTileColour?: string | null,
): string {
  const up = (areaUpgrades || []).find(u => u.areaId === 'laundry');
  const plank = plankBathChoiceName(spcTileColour);
  const standard = plank ? `${LAUNDRY_PLANK_PRODUCT} — ${plank} (standard)` : LAUNDRY_STANDARD_LABEL;
  if (!up) return standard;
  const material = UPGRADE_MATERIALS.find(m => m.id === up.materialType)?.name;
  const text = [material, up.productName, up.productColor].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
  return text || standard;
}
