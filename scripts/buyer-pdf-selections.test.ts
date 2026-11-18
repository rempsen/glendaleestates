import { test, expect } from 'bun:test';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import type { Tables } from '../src/integrations/supabase/types';

const record = {
  unit_number: '2', first_name: 'Marlis', last_name: 'Wilson',
  stair_upgrade_type: 'lvp', stair_lvp_upgrade_selected: false,
  backsplash_grout_enabled: true, backsplash_grout_color: 'Pewter #2',
  lvp_comments: 'Keep the living-room direction', spc_tile_comments: 'Tile selection note',
  window_comments: 'Secure bottom of shade', backsplash_grout_comments: 'Use selected grout',
  upgrade_comments: 'Office selection confirmation', upgrade_interests_notes: 'Discuss options',
  sales_comments: 'Private sales note', admin_notes: 'Private office note',
  area_upgrades: [{ areaId: 'masterEnsuite', materialType: 'tile', comments: 'Shower tile specifications', manualPrice: 8400 }],
} as unknown as Tables<'buyer_selections'>;

test('Unit 2 stair LVP comes from canonical selection even when legacy flag disagrees', () => {
  expect(toBuyerPdfSelections(record).stairLvpUpgradeSelected).toBe(true);
  expect(toBuyerPdfSelections(record).stairUpgradeType).toBe('lvp');
});
test('Unit 2 grout selection and colour are preserved', () => {
  expect(toBuyerPdfSelections(record).backsplashGrout.enabled).toBe(true);
  expect(toBuyerPdfSelections(record).backsplashGrout.groutColor).toBe('Pewter #2');
});
test('legacy saved LVP upgrades are not discarded by an old default stair type', () => {
  expect(toBuyerPdfSelections({ ...record, stair_upgrade_type: 'standard', stair_lvp_upgrade_selected: true }).stairLvpUpgradeSelected).toBe(true);
});
for (const [stored, mapped] of [
  ['lvp_comments', 'lvpComments'], ['spc_tile_comments', 'spcTileComments'],
  ['window_comments', 'windowComments'], ['upgrade_comments', 'upgradeComments'],
  ['upgrade_interests_notes', 'upgradeInterestsNotes'],
] as const) {
  test(`${stored} reaches PDF input unchanged`, () => {
    expect(toBuyerPdfSelections(record)[mapped]).toBe(record[stored]);
  });
}
test('grout and area comments survive mapping', () => {
  const mapped = toBuyerPdfSelections(record);
  expect(mapped.backsplashGrout.comments).toBe('Use selected grout');
  expect(mapped.areaUpgrades[0].comments).toBe(''); // internal text stripped at the buyer-safe boundary
  expect(mapped.areaUpgrades[0].manualPrice).toBe(8400);
});
test('internal office and sales notes cannot reach buyer PDF inputs', () => {
  const mapped = JSON.stringify(toBuyerPdfSelections(record));
  expect(mapped.includes('Private sales note')).toBe(false);
  expect(mapped.includes('Private office note')).toBe(false);
});
// ---- Task 7: client-visible vs internal area notes ----
import { clientAreaNotes, internalAreaNotes } from '../src/lib/areaNotes';

const bothFields = {
  ...record,
  area_upgrades: [
    { areaId: 'masterEnsuite', materialType: 'tile', clientComment: 'Please use matte finish', comments: 'INTERNAL: buyer is price sensitive', manualPrice: 8400 },
    { areaId: 'laundry', materialType: 'lvp', comments: 'legacy internal only' },
  ],
} as unknown as Tables<'buyer_selections'>;

test('toBuyerPdfSelections strips internal comments and keeps clientComment', () => {
  const rows = toBuyerPdfSelections(bothFields).areaUpgrades;
  expect(JSON.stringify(rows).includes('INTERNAL')).toBe(false);
  expect(JSON.stringify(rows).includes('legacy internal only')).toBe(false);
  expect(rows[0].clientComment).toBe('Please use matte finish');
  expect(rows[0].manualPrice).toBe(8400);
});
test('buyer notes mapper returns clientComment text and not comments text', () => {
  const upgrades = toBuyerPdfSelections(bothFields).areaUpgrades;
  const notes = clientAreaNotes(upgrades);
  expect(notes.map(n => n.text)).toEqual(['Please use matte finish']);
  expect(JSON.stringify(notes).includes('INTERNAL')).toBe(false);
  expect(JSON.stringify(notes).includes('legacy internal only')).toBe(false);
});
test('internal notes mapper returns comments only, for staff outputs', () => {
  const notes = internalAreaNotes(bothFields.area_upgrades as any[]);
  expect(notes.map(n => n.text)).toEqual(['INTERNAL: buyer is price sensitive', 'legacy internal only']);
});
test('internal notes come from the raw row, not the mapped buyer selections', () => {
  expect(internalAreaNotes((bothFields.area_upgrades as any[])).length).toBe(2);
  expect(internalAreaNotes(toBuyerPdfSelections(bothFields).areaUpgrades)).toEqual([]);
});
test('notes mappers keep the original row index and ignore blank text', () => {
  const notes = clientAreaNotes([{ areaId: 'a', clientComment: '  ' }, { areaId: 'b', clientComment: 'x' }] as any);
  expect(notes).toEqual([{ areaId: 'b', index: 1, text: 'x' }]);
});

// ---- Task 11: base-spec buyer wording ----
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStandardSelectionRows, totalsInputFromSelections } from '../src/lib/buyerPdfGenerator';
import { computeUpgradeTotals } from '../src/lib/upgradeTotals';
import { buildWordSelectionRows } from '../src/lib/submissionWordRows';
import { LAUNDRY_STANDARD_LABEL, toBuyerWording } from '../src/lib/outputLabels';

const stubPricing = {
  markupPercentage: 0.6, gstRate: 0.05,
  getMaterialCost: (t: string) => ({ lvp: 4, carpet: 20, tile: 8 } as Record<string, number>)[t] || 0,
  getGroutColorFee: () => 300, getAdditionalWindowPrice: () => 673.5, getPatioDoorPrice: () => 2347.8,
  getAutomatedMotorPrice: () => 495, getHeatedFloorPrice: () => 1650,
  getStairLvpUpgradePrice: () => 2160, getStairCarpetUpgradePrice: () => 640,
} as any;

const typeC = {
  ...record, unit_type: 'Unit Type C', has_stairs: true,
  stair_upgrade_type: 'standard', stair_lvp_upgrade_selected: false, stair_premium_carpet_selected: false,
  spc_tile_colour: 'piccolo', bedroom_flooring_choice: 'carpet', bedroom_carpet_colour: 'Wolf River',
  area_upgrades: [{ areaId: 'laundry', materialType: 'lvp', productName: 'Coastal Oak', productColor: '', comments: '' }],
} as unknown as Tables<'buyer_selections'>;
const rowsFor = (r: Tables<'buyer_selections'>) => {
  const sel = toBuyerPdfSelections(r);
  return buildStandardSelectionRows(sel, stubPricing, computeUpgradeTotals(totalsInputFromSelections(sel, 'C'), stubPricing));
};
const get = (rows: string[][], label: string) => rows.find(r => r[0] === label)?.[1];

test('PDF standard rows use base-spec labels for a Type C record', () => {
  const rows = rowsFor(typeC);
  expect(get(rows, 'Bathroom Tile')).toBeDefined();
  expect(get(rows, 'Primary Bedroom Flooring')).toBe('Carpet');
  expect(get(rows, 'Primary Bedroom Carpet Colour')).toBeDefined();
  expect(get(rows, 'Stair Flooring – Carpet')).toBe('Standard Carpet (Included)');
  expect(get(rows, 'Laundry Room')).toContain('Coastal Oak');
  expect(rows.some(r => /Bathroom\/Laundry|Master Bedroom/.test(r[0]))).toBe(false);
});
test('laundry defaults to the single standard label when no laundry upgrade exists', () => {
  const rows = rowsFor({ ...typeC, area_upgrades: [] } as any);
  expect(get(rows, 'Laundry Room')).toBe('Luxury Vinyl Plank (standard)');
  expect(LAUNDRY_STANDARD_LABEL).toBe('Luxury Vinyl Plank (standard)');
});
test('upgraded stair carpet keeps the upgrade text', () => {
  const rows = rowsFor({ ...typeC, stair_premium_carpet_selected: true } as any);
  expect(get(rows, 'Stair Flooring – Carpet')).toContain('Premium Carpet Upgrade');
});
test('no stairs row when the unit has no stairs', () => {
  expect(get(rowsFor({ ...typeC, has_stairs: false } as any), 'Stair Flooring – Carpet')).toBeUndefined();
});
test('Word rows use the same labels and resolve colour ids to names', () => {
  const rows = buildWordSelectionRows(typeC, stubPricing, 'C');
  expect(get(rows, 'Bathroom Tile')).not.toBe('piccolo');
  expect(get(rows, 'Primary Bedroom Flooring')).toBe('Carpet');
  expect(get(rows, 'Primary Bedroom Carpet Colour')).toBeDefined();
  expect(get(rows, 'Stair Flooring – Carpet')).toBe('Standard Carpet (Included)');
  expect(get(rows, 'Laundry Room')).toContain('Coastal Oak');
  expect(rows.some(r => /Bathroom\/Laundry|Master Bedroom/.test(r[0] + r[1]))).toBe(false);
});
test('toBuyerWording renames Master Bedroom to Primary Bedroom', () => {
  expect(toBuyerWording('Master Bedroom (Carpet)')).toBe('Primary Bedroom (Carpet)');
});
test('email edge function and CSV carry the exact labels and mirror the laundry constant', () => {
  const edge = readFileSync(join(import.meta.dir, '../supabase/functions/send-selections-email/index.ts'), 'utf8');
  expect(edge).toContain("const LAUNDRY_STANDARD_LABEL = 'Luxury Vinyl Plank (standard)'");
  for (const l of ["'Bathroom Tile'", "'Primary Bedroom Flooring'", "'Primary Bedroom Carpet Colour'", "'Stair Flooring – Carpet'", "'Standard Carpet (Included)'", "'Laundry Room'"]) {
    expect(edge).toContain(l);
  }
  expect(edge.includes('Bathroom/Laundry')).toBe(false);
  expect(edge.includes('Master Bedroom')).toBe(false);
});
test('resend-confirmation-email carries the same base-spec labels', () => {
  const edge = readFileSync(join(import.meta.dir, '../supabase/functions/resend-confirmation-email/index.ts'), 'utf8');
  expect(edge).toContain("const LAUNDRY_STANDARD_LABEL = 'Luxury Vinyl Plank (standard)'");
  for (const l of ["'Bathroom Tile'", "'Primary Bedroom Flooring'", "'Primary Bedroom Carpet Colour'", "'Stair Flooring – Carpet'", "'Standard Carpet (Included)'", "'Laundry Room'"]) expect(edge).toContain(l);
  expect(edge.includes('Bathroom/Laundry') || edge.includes('Master Bedroom')).toBe(false);
});
