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
  expect(mapped.areaUpgrades[0].comments).toBe('Shower tile specifications');
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

test('buyer notes mapper returns clientComment text and not comments text', () => {
  const upgrades = toBuyerPdfSelections(bothFields).areaUpgrades;
  const notes = clientAreaNotes(upgrades);
  expect(notes.map(n => n.text)).toEqual(['Please use matte finish']);
  expect(JSON.stringify(notes).includes('INTERNAL')).toBe(false);
  expect(JSON.stringify(notes).includes('legacy internal only')).toBe(false);
});
test('internal notes mapper returns comments only, for staff outputs', () => {
  const notes = internalAreaNotes(toBuyerPdfSelections(bothFields).areaUpgrades);
  expect(notes.map(n => n.text)).toEqual(['INTERNAL: buyer is price sensitive', 'legacy internal only']);
});
test('notes mappers keep the original row index and ignore blank text', () => {
  const notes = clientAreaNotes([{ areaId: 'a', clientComment: '  ' }, { areaId: 'b', clientComment: 'x' }] as any);
  expect(notes).toEqual([{ areaId: 'b', index: 1, text: 'x' }]);
});
