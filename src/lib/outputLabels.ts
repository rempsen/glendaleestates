import { UPGRADE_MATERIALS } from '@/lib/upgradeCostData';

// Buyer-facing wording shared by the PDF, Word export and CSV. The email edge function cannot
// import from src/, so supabase/functions/send-selections-email/index.ts mirrors these constants
// (scripts/buyer-pdf-selections.test.ts checks the mirror). Change copy here and there together.

// Base spec: Luxury Vinyl Plank throughout; Dante 2.0 tile in washrooms only.
// Pending Dan's confirmation (controller ruling) — one edit changes every renderer.
export const LAUNDRY_ROW_LABEL = 'Laundry Room';
export const LAUNDRY_STANDARD_LABEL = 'Ceratec Dante 2.0 LVT (standard)';
export const BATHROOM_TILE_LABEL = 'Bathroom Tile';
export const PRIMARY_BEDROOM_FLOORING_LABEL = 'Primary Bedroom Flooring';
export const PRIMARY_BEDROOM_CARPET_COLOUR_LABEL = 'Primary Bedroom Carpet Colour';
export const STAIR_CARPET_LABEL = 'Stair Flooring – Carpet'; // en dash
export const STAIR_STANDARD_VALUE = 'Standard Carpet (Included)';

/** Buyer-facing copy only: internal ids, columns and admin labels keep their names. */
export const toBuyerWording = (s: string): string => s.replace(/Master Bedroom/g, 'Primary Bedroom');

/** Laundry row value: the upgraded material when an area_upgrades row for laundry exists, else the standard label. */
export function laundryValue(areaUpgrades: ReadonlyArray<{ areaId?: string; materialType?: string; productName?: string; productColor?: string }> | null | undefined): string {
  const up = (areaUpgrades || []).find(u => u.areaId === 'laundry');
  if (!up) return LAUNDRY_STANDARD_LABEL;
  const material = UPGRADE_MATERIALS.find(m => m.id === up.materialType)?.name;
  const text = [material, up.productName, up.productColor].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
  return text || LAUNDRY_STANDARD_LABEL;
}
