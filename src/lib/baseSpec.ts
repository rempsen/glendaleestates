import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';

// Per-unit-type base specification: what every unit includes as standard. This constant is the
// source of truth for migration 0007 (scripts/gen-base-spec-sql.ts generates the seed from it) and
// carries no prices; upgrade pricing comes from the pricing engines.

/** Section vocabulary shared with the quote_lines / unit_base_spec CHECK constraints (migration 0006). */
export type BaseSpecSection =
  | 'standard' | 'flooring' | 'tile' | 'backsplash' | 'stairs'
  | 'window_coverings' | 'bathroom' | 'basement' | 'other';

export interface BaseSpecRow {
  unitTypeCode: string;
  section: BaseSpecSection;
  location: string;
  label: string;
  defaultProduct: string | null;
  defaultColourOptions: string[];
  isIncluded: boolean;
}

/** Laundry default product (Dan, 2026-11-18 17:00 CT); outputLabels.LAUNDRY_STANDARD_LABEL starts with this. */
export const LAUNDRY_DEFAULT_PRODUCT = 'Ceratec Dante 2.0 LVT';

const LVP_COLOURS = ['Cortland', 'Opal', 'Wolf River'];
const DANTE_COLOURS = ['Pezzo', 'Piccolo', 'Venatino'];
const LUXOR_I_COLOURS = ['Winterbrooke 898', 'Midnight Shadow 427', 'Jet Stream 200', 'Sawgrass 701'];

const BEDROOM_FLOORING_PRODUCT = 'LVP or Luxor I carpet + standard underpad';
const STAIR_PRODUCT = 'Standard carpet + underpad';
const BACKSPLASH_PRODUCT = '3×8 subway tile';
const SHADE_PRODUCT = 'Graber blackout shade';
export const BASEMENT_LABEL = 'Unfinished — pricing not released';

/** Per-type room facts, derived from `unit_area_data` (G and H combine their -1 / -2 rows). */
interface TypeRooms {
  code: string;
  laundry: boolean;
  secondBedroom: boolean;
  ensuite: boolean;
  stairsToSecondFloor: boolean;
}

const TYPE_ROOMS: TypeRooms[] = [
  { code: 'A', laundry: false, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
  { code: 'B', laundry: false, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
  { code: 'C', laundry: true, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
  { code: 'D', laundry: true, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
  { code: 'E', laundry: true, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
  { code: 'F', laundry: true, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
  { code: 'G', laundry: true, secondBedroom: false, ensuite: true, stairsToSecondFloor: true },
  { code: 'H', laundry: true, secondBedroom: false, ensuite: true, stairsToSecondFloor: true },
  { code: 'J', laundry: true, secondBedroom: true, ensuite: true, stairsToSecondFloor: false },
];

function rowsFor(t: TypeRooms): BaseSpecRow[] {
  const row = (
    section: BaseSpecSection, location: string, label: string, defaultProduct: string | null,
    defaultColourOptions: string[] = [], isIncluded = true,
  ): BaseSpecRow => ({ unitTypeCode: t.code, section, location, label, defaultProduct, defaultColourOptions, isIncluded });

  const rows: BaseSpecRow[] = [
    row('flooring', 'Main Living', 'Main Living Flooring', 'XL Flooring LVP', LVP_COLOURS),
    row('tile', 'Main Bathroom', 'Bathroom Tile', 'Dante 2.0', DANTE_COLOURS),
  ];
  if (t.ensuite) rows.push(row('tile', 'Primary Ensuite', 'Bathroom Tile', 'Dante 2.0', DANTE_COLOURS));
  if (t.laundry) rows.push(row('flooring', 'Laundry Room', 'Laundry Flooring', LAUNDRY_DEFAULT_PRODUCT, DANTE_COLOURS));
  rows.push(row('flooring', 'Primary Bedroom', 'Primary Bedroom Flooring', BEDROOM_FLOORING_PRODUCT, LUXOR_I_COLOURS));
  if (t.secondBedroom) rows.push(row('flooring', 'Second Bedroom', 'Second Bedroom Flooring', BEDROOM_FLOORING_PRODUCT, LUXOR_I_COLOURS));
  if (t.stairsToSecondFloor) rows.push(row('stairs', 'Stairs to Second Floor', 'Stair Flooring – Carpet', STAIR_PRODUCT));
  rows.push(row('stairs', 'Stairs to Lower Level', 'Stair Flooring – Carpet', STAIR_PRODUCT));
  rows.push(row('backsplash', 'Kitchen', 'Kitchen Backsplash', BACKSPLASH_PRODUCT));
  rows.push(row('window_coverings', 'Primary Bedroom', 'Bedroom Window Covering', SHADE_PRODUCT));
  if (t.secondBedroom) rows.push(row('window_coverings', 'Second Bedroom', 'Bedroom Window Covering', SHADE_PRODUCT));
  rows.push(row('basement', 'Basement', BASEMENT_LABEL, null, [], false));
  return rows;
}

export const BASE_SPEC: BaseSpecRow[] = TYPE_ROOMS.flatMap(rowsFor);

/** Base-spec rows for a unit type. Accepts `G-1`/`G-2`, `Unit Type A`, `Corner Unit H-2` etc.; unknown types give []. */
export function baseSpecFor(unitTypeCode: string | null | undefined): BaseSpecRow[] {
  const normalized = normalizeUnitTypeCode(unitTypeCode ?? null);
  if (!normalized) return [];
  const logical = normalized.replace(/-[12]$/, '');
  return BASE_SPEC.filter((r) => r.unitTypeCode === logical);
}
