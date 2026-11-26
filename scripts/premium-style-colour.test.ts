// Brian's review (2026-11-26): premium carpet = Dream Weaver San Lucas / Valter, picked style → colour; premium LVP =
// Synergy / TIER Element Premier; the duplicate $0 Master Bedroom (Carpet) tile is hidden.
import { test, expect, describe } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { serverPricingFromRows } from '../supabase/functions/_shared/loadServerPricing';
import { baseSpecFor } from '../src/lib/baseSpec';
import { generateQuoteLines, type GenerateInput, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { quoteSelectionsFromRow } from '../supabase/functions/_shared/quoteSelectionsFromRow.ts';
import { buyerSelectionsInsertRow, parseSelectionBody, premiumCarpetColumns } from '../supabase/functions/_shared/submissionRow.ts';
import {
  HIDDEN_AREA_IDS, PREMIUM_CARPET_STYLES, PREMIUM_LVP_STYLES, colourLabel, findPremiumColour, findPremiumStyle,
  pickerFamilyFor, premiumChoiceComplete, premiumFamilyForMaterial,
} from '../src/lib/premiumProducts';

const root = join(import.meta.dir, '..');
const snapshot = pricingSnapshot as unknown as PricingSnapshot;
const pricing = serverPricingFromRows({
  pricing_config: snapshot.pricing_config,
  upgrade_materials: snapshot.upgrade_materials.filter((m) => m.is_active),
  unit_area_data: snapshot.unit_area_data,
});
type Sel = GenerateInput['selections'];
const base: Sel = { areaUpgrades: [], bedroomFlooringChoice: '', additionalWindowsQty: 0, patioDoorsQty: 0, automatedWindowsQty: 0 };
const gen = (code: string, sel: Partial<Sel>) =>
  generateQuoteLines({ selections: { ...base, ...sel }, unitTypeCode: code, pricing, baseSpec: baseSpecFor(code) });
const byField = (lines: QuoteLine[], f: string) => lines.filter((l) => l.wizard_field === f);
const strip = (lines: QuoteLine[]) => lines.map(({ product_name, product_colour, ...rest }) => rest);

describe('catalogue', () => {
  test('San Lucas 8623 (6 colours) and Valter 8655 (12 colours, brochure numbers)', () => {
    const [sl, va] = PREMIUM_CARPET_STYLES;
    expect(sl.productName).toBe('Dream Weaver San Lucas 8623');
    expect(sl.colours.map(colourLabel)).toEqual([
      'East Cape 6130', 'Carmel Valley 6235', 'Santiago 6253', 'Monterey 6429', 'Lockwood 8294', 'Arch of Cabo 8985',
    ]);
    expect(va.productName).toBe('Dream Weaver Valter 8655');
    expect(va.colours).toHaveLength(12);
    const brochure = { 'Sand Island': '8215', Oberon: '8027', Beacon: '8095', 'Prairie Grove': '8120', 'Point Break': '8153',
      Fortress: '8172', 'The Dunes': '8080', Rockaway: '8199', 'Sweet Spot': '8077', 'Yuca Bloom': '2769', Cabo: '2703',
      'Vintage China': '8227' } as Record<string, string>;
    for (const c of va.colours) expect(c.code).toBe(brochure[c.name]);
  });
  test('every carpet swatch (grid + high-res) is in /public', () => {
    for (const s of PREMIUM_CARPET_STYLES) for (const c of s.colours) {
      expect(existsSync(join(root, 'public', c.thumb))).toBe(true);
      expect(existsSync(join(root, 'public', c.full))).toBe(true);
    }
  });
  test('ids are unique; LVP collections are Synergy (6) and TIER Element Premier (4)', () => {
    const ids = [...PREMIUM_CARPET_STYLES, ...PREMIUM_LVP_STYLES].flatMap((s) => s.colours.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(PREMIUM_LVP_STYLES.map((s) => [s.productName, s.colours.length])).toEqual([
      ['Richmond Synergy Premium Plank', 6], ['TIER Element Premier (PVC-free)', 4],
    ]);
  });
  test('stored text round-trips to the catalogue entry', () => {
    const s = findPremiumStyle('carpet', 'Dream Weaver Valter 8655')!;
    expect(s.id).toBe('valter');
    expect(findPremiumColour(s, 'Rockaway 8199')?.id).toBe('valter-rockaway');
    expect(findPremiumStyle('carpet', 'san lucas')?.id).toBe('san-lucas');
    expect(findPremiumStyle('carpet', '')).toBeUndefined();
    expect(findPremiumColour(s, 'East Cape 6130')).toBeUndefined(); // a San Lucas colour is not a Valter colour
  });
  test('picker families: carpet → carpet; Premium LVP → lvp; others none', () => {
    expect(premiumFamilyForMaterial('carpet')).toBe('carpet');
    expect(premiumFamilyForMaterial('lvp')).toBe('lvp');
    expect(premiumFamilyForMaterial('premium_lvp')).toBe('lvp');
    for (const m of ['hardwood', 'lvt', 'tile', 'nonstandard_lvp', 'nonstandard_lvt', '']) expect(premiumFamilyForMaterial(m)).toBeNull();
  });
});

describe('quote lines', () => {
  const bedroom = { bedroomFlooringChoice: 'carpet', bedroomCarpetColour: 'Winterbrooke 898', premiumCarpetBedroom: true };
  test('bedroom premium carpet line names the style and colour; price unchanged', () => {
    const before = gen('C', bedroom);
    const after = gen('C', { ...bedroom, premiumCarpetBedroomStyle: 'Dream Weaver San Lucas 8623', premiumCarpetBedroomColour: 'East Cape 6130' });
    const [p] = byField(after, 'premium_carpet_bedroom');
    expect(p.product_name).toBe('Dream Weaver San Lucas 8623');
    expect(p.product_colour).toBe('East Cape 6130');
    expect(p.amount).toBe(byField(before, 'premium_carpet_bedroom')[0].amount);
    expect(strip(after)).toEqual(strip(before)); // only product text changes
    const included = byField(after, 'bedroom_flooring_choice');
    expect(included.length).toBeGreaterThan(0);
    for (const l of included) {
      expect(l.product_name).toBe('Dream Weaver San Lucas 8623 (premium upgrade) + standard underpad');
      expect(l.product_colour).toBe('East Cape 6130');
    }
  });
  test('hard-surface second bedroom keeps its own line', () => {
    const lines = gen('C', {
      ...bedroom, premiumCarpetBedroomStyle: 'Dream Weaver Valter 8655', premiumCarpetBedroomColour: 'Rockaway 8199',
      areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp', productName: '', productColor: '' }],
    });
    const second = byField(lines, 'bedroom_flooring_choice').find((l) => /Second/.test(l.location));
    expect(second?.product_name).not.toMatch(/Valter/);
  });
  test('stairs to lower level premium carpet names the style and colour', () => {
    const sel = { stairUpgradeType: 'standard', stairCarpetColour: 'Sawgrass 701', stairPremiumCarpetSelected: true };
    const before = gen('A', sel);
    const after = gen('A', { ...sel, stairPremiumCarpetStyle: 'Dream Weaver Valter 8655', stairPremiumCarpetColour: 'Cabo 2703' });
    const [p] = byField(after, 'stair_premium_carpet_selected');
    expect(p.product_name).toBe('Dream Weaver Valter 8655');
    expect(p.product_colour).toBe('Cabo 2703');
    expect(strip(after)).toEqual(strip(before));
    const [inc] = byField(after, 'stair_carpet_colour');
    expect(inc.product_name).toBe('Dream Weaver Valter 8655 (premium upgrade)');
  });
  test('a style left behind on an unticked upgrade never prints', () => {
    const lines = gen('A', {
      stairUpgradeType: 'standard', stairCarpetColour: 'Sawgrass 701', stairPremiumCarpetSelected: false,
      stairPremiumCarpetStyle: 'Dream Weaver Valter 8655', stairPremiumCarpetColour: 'Cabo 2703',
    });
    expect(JSON.stringify(lines)).not.toContain('Valter');
  });
});

describe('submit path (wizard body → row → lines)', () => {
  const body = (extra: Record<string, unknown>) => parseSelectionBody({
    unitNumber: '7', firstName: 'A', lastName: 'B', email: 'a@b.c', hasStairs: true, bedroomLvpSameAsMain: true,
    additionalWindowsQty: 0, patioDoorsQty: 0, automatedWindowsQty: 0, upgradeInterests: {}, windowTotal: 0, ...extra,
  });
  test('no premium carpet → no 0017 columns in the insert (works before the migration)', () => {
    const row = buyerSelectionsInsertRow(body({ stairPremiumCarpetStyle: 'Dream Weaver Valter 8655' }));
    for (const c of ['premium_carpet_bedroom_style', 'premium_carpet_bedroom_colour', 'stair_premium_carpet_style', 'stair_premium_carpet_colour']) {
      expect(c in row).toBe(false);
    }
  });
  test('ticked + chosen → columns written and read back into the generator', () => {
    const data = body({
      bedroomFlooringChoice: 'carpet', premiumCarpetBedroom: true,
      premiumCarpetBedroomStyle: 'Dream Weaver San Lucas 8623', premiumCarpetBedroomColour: 'Monterey 6429',
      stairPremiumCarpetSelected: true, stairPremiumCarpetStyle: 'Dream Weaver Valter 8655', stairPremiumCarpetColour: 'Beacon 8095',
    });
    expect(premiumCarpetColumns(data)).toEqual({
      premium_carpet_bedroom_style: 'Dream Weaver San Lucas 8623', premium_carpet_bedroom_colour: 'Monterey 6429',
      stair_premium_carpet_style: 'Dream Weaver Valter 8655', stair_premium_carpet_colour: 'Beacon 8095',
    });
    const sel = quoteSelectionsFromRow(buyerSelectionsInsertRow(data));
    expect(sel.premiumCarpetBedroomColour).toBe('Monterey 6429');
    expect(sel.stairPremiumCarpetStyle).toBe('Dream Weaver Valter 8655');
  });
});

describe('Upgrades picker + migration', () => {
  test('masterBedroomCarpet is hidden unless a stored row needs it', () => {
    expect(HIDDEN_AREA_IDS.has('masterBedroomCarpet')).toBe(true);
    expect(HIDDEN_AREA_IDS.has('masterBedroom')).toBe(false);
    const src = readFileSync(join(root, 'src/components/RoomUpgradePicker.tsx'), 'utf8');
    expect(src).toContain('if (HIDDEN_AREA_IDS.has(area.id) && !selections.some(s => s.areaId === area.id)) return false;');
  });
  test('stair "lvp" (standard LVP with nosings) gets no premium picker; stair premium LVP and carpet do', () => {
    expect(pickerFamilyFor('stairs', 'lvp')).toBeNull();
    expect(pickerFamilyFor('stairs', 'premium_lvp')).toBe('lvp');
    expect(pickerFamilyFor('stairs', 'carpet')).toBe('carpet');
    expect(pickerFamilyFor('mainLiving', 'lvp')).toBe('lvp');
    expect(pickerFamilyFor('mainLiving', 'hardwood')).toBeNull();
  });
  test('Add/Update needs a catalogue style AND one of its colours', () => {
    expect(premiumChoiceComplete('carpet', 'Dream Weaver San Lucas 8623', 'East Cape 6130')).toBe(true);
    expect(premiumChoiceComplete('carpet', 'Dream Weaver San Lucas 8623', '')).toBe(false);
    expect(premiumChoiceComplete('carpet', 'Some other carpet', 'East Cape 6130')).toBe(false);
    expect(premiumChoiceComplete('lvp', 'Richmond Synergy Premium Plank', 'Toffee RVISYPRTOFF')).toBe(true);
  });
  test('0017 is additive, idempotent and journalled', () => {
    const sqlPath = join(root, 'drizzle/migrations/0017_premium_carpet_style_colour.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql.match(/ADD COLUMN IF NOT EXISTS \w+ text,?/g)).toHaveLength(4);
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/\b(DROP|DEFAULT|UPDATE|DELETE)\b/i);
    const journal = JSON.parse(readFileSync(join(root, 'drizzle/migrations/meta/_journal.json'), 'utf8'));
    expect(journal.entries.at(-1)).toEqual({ idx: 17, version: '7', when: 1796300000000, tag: '0017_premium_carpet_style_colour', breakpoints: true });
    expect(createHash('sha256').update(readFileSync(sqlPath)).digest('hex')).toHaveLength(64);
  });
});
