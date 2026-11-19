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

// ---- Task 11: base-spec buyer wording (Phase 2 Task 10: PDF and Word rows now come from quote lines) ----
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, pricingFromRows } from './lib/generateInputFromRow';
import { generateQuoteLines } from '../supabase/functions/_shared/quoteLines.ts';
import { buildLineRows, INCLUDED_AMOUNT_TEXT, type LineRow } from '../src/lib/lineRenderRows';
import { buildWordLineTables } from '../src/lib/submissionWordRows';
import { LAUNDRY_STANDARD_LABEL, toBuyerWording } from '../src/lib/outputLabels';

const linePricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);

const typeC = {
  ...record, unit_type: 'Unit Type C', has_stairs: true,
  stair_upgrade_type: 'standard', stair_lvp_upgrade_selected: false, stair_premium_carpet_selected: false,
  spc_tile_colour: 'piccolo', bedroom_flooring_choice: 'carpet', bedroom_carpet_colour: 'Wolf River',
  area_upgrades: [{ areaId: 'laundry', materialType: 'lvp', productName: 'Coastal Oak', productColor: '', comments: '' }],
} as unknown as Tables<'buyer_selections'>;
const modelFor = (r: Tables<'buyer_selections'>) =>
  buildLineRows(generateQuoteLines(buildGenerateInputFromRow(r as never, linePricing)), { buyerView: true, gstRate: linePricing.gstRate });
const allOf = (m: ReturnType<typeof modelFor>): LineRow[] => [...m.standard, ...m.upgrades.bySection.flatMap(s => s.rows), ...m.notInTotal];
const std = (r: Tables<'buyer_selections'>, item: string, location?: string) =>
  modelFor(r).standard.find(x => x.item === item && (!location || x.location === location));

test('PDF standard rows use base-spec labels for a Type C record', () => {
  const m = modelFor(typeC);
  expect(std(typeC, 'Bathroom Tile')).toBeDefined();
  expect(std(typeC, 'Bathroom Tile')!.product).not.toContain('piccolo'); // colour id resolved to its name
  expect(std(typeC, 'Primary Bedroom Flooring', 'Primary Bedroom')!.product).toContain('carpet');
  expect(std(typeC, 'Primary Bedroom Flooring')!.product).toContain('Wolf River');
  expect(std(typeC, 'Stair Flooring – Carpet')!.amount).toBe('Included — $0.00');
  expect(m.standard.find(x => x.location === 'Laundry Room')).toBeDefined();
  // The laundry upgrade is a counted line in the Laundry Room.
  expect(m.upgrades.bySection.flatMap(s => s.rows).find(x => x.location === 'Laundry Room')!.product).toContain('Coastal Oak');
  expect(allOf(m).some(r => /Bathroom\/Laundry|Master Bedroom/.test(r.cells.join(' ')))).toBe(false);
});
test('every standard row prints Included — $0.00 with no unit price', () => {
  const m = modelFor(typeC);
  expect(m.standard.length).toBeGreaterThan(0);
  for (const r of m.standard) { expect(r.amount).toBe(INCLUDED_AMOUNT_TEXT); expect(r.unitPrice).toBe(''); }
});
test('laundry keeps the standard Ceratec Dante 2.0 LVT line when no laundry upgrade exists', () => {
  const r = { ...typeC, area_upgrades: [] } as any;
  expect(std(r, 'Laundry Flooring', 'Laundry Room')!.product).toBe('Ceratec Dante 2.0 LVT');
  expect(LAUNDRY_STANDARD_LABEL).toBe('Ceratec Dante 2.0 LVT (standard)');
});
test('upgraded stair carpet prints as a counted stairs line', () => {
  const m = modelFor({ ...typeC, stair_premium_carpet_selected: true } as any);
  const stairs = m.upgrades.bySection.find(s => s.section === 'stairs')!;
  expect(stairs.rows.some(r => /Premium carpet/i.test(r.item))).toBe(true);
});
test('standard stairs with a chosen colour print product — colour', () => {
  expect(std({ ...typeC, stair_carpet_colour: 'Wolf River' } as any, 'Stair Flooring – Carpet')!.product).toBe('Standard carpet + underpad — Wolf River');
});
test('Word line tables carry the same rows and labels as the PDF', () => {
  const m = modelFor(typeC);
  const t = buildWordLineTables(m);
  expect(t.standard).toEqual(m.standard.map(r => r.cells));
  expect(t.standard.some(c => c[0] === 'Primary Bedroom')).toBe(true);
  expect(t.standard.some(c => c[1] === 'Bathroom Tile')).toBe(true);
  expect(t.standard.some(c => c[0] === 'Laundry Room')).toBe(true);
  expect(t.standard.some(c => c[1] === 'Stair Flooring – Carpet' && c[5] === 'Included — $0.00')).toBe(true);
  expect(t.totals.map(r => r[0])).toEqual(['Upgrades', 'Window coverings', 'Subtotal', 'GST 5%', 'Total']);
  expect(t.upgrades.some(c => c[1] === 'Flooring subtotal')).toBe(true);
  expect(JSON.stringify(t).includes('Master Bedroom') || JSON.stringify(t).includes('Bathroom/Laundry')).toBe(false);
});
test('toBuyerWording renames Master Bedroom to Primary Bedroom', () => {
  expect(toBuyerWording('Master Bedroom (Carpet)')).toBe('Primary Bedroom (Carpet)');
});
test('email edge function and CSV carry the exact labels and mirror the laundry constant', () => {
  // Task 11: the submit emails' renderers moved to send-selections-email/emails.ts (pure, edge-string tested).
  const edge = readFileSync(join(import.meta.dir, '../supabase/functions/send-selections-email/emails.ts'), 'utf8');
  expect(edge).toContain("const LAUNDRY_STANDARD_LABEL = 'Ceratec Dante 2.0 LVT (standard)'");
  for (const l of ["'Bathroom Tile'", "'Primary Bedroom Flooring'", "'Primary Bedroom Carpet Colour'", "'Stair Flooring – Carpet'", "'Standard Carpet (Included)'", "'Laundry Room'"]) {
    expect(edge).toContain(l);
  }
  expect(edge.includes('Bathroom/Laundry')).toBe(false);
  expect(edge.includes('Master Bedroom')).toBe(false);
});
test('resend-confirmation-email prints the base-spec labels from the lines (no label copies of its own)', () => {
  const edge = readFileSync(join(import.meta.dir, '../supabase/functions/resend-confirmation-email/emails.ts'), 'utf8');
  expect(edge).toContain('renderLinesEmailHtml');
  expect(edge.includes('Bathroom/Laundry') || edge.includes('Master Bedroom')).toBe(false);
});
test('edge buyerWording mirrors src toBuyerWording and is applied to every printed line cell', async () => {
  const shared = await import('../supabase/functions/_shared/buyerWording');
  for (const s of ['Master Bedroom (Carpet) (Premium Carpet)', 'Heated Floor (Master Bedroom)', 'Guest Bathroom', '']) expect(shared.toBuyerWording(s)).toBe(toBuyerWording(s));
  expect(shared.toBuyerWording('Master Bedroom (Carpet) (Premium Carpet)')).toBe('Primary Bedroom (Carpet) (Premium Carpet)');
  const rows = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/lineRenderRows.ts'), 'utf8');
  expect(rows).toContain("import { toBuyerWording } from './buyerWording.ts'");
  expect(rows).toContain('toBuyerWording((s ??');
});

test('both email edge functions render through the shared line renderer (included lines print Included — $0.00)', () => {
  for (const fn of ['send-selections-email', 'resend-confirmation-email']) {
    const edge = readFileSync(join(import.meta.dir, `../supabase/functions/${fn}/emails.ts`), 'utf8');
    expect(edge).toContain('renderLinesEmailHtml(');
  }
  expect(readFileSync(join(import.meta.dir, '../supabase/functions/_shared/lineRenderRows.ts'), 'utf8')).toContain("INCLUDED_AMOUNT_TEXT = 'Included — $0.00'");
});
