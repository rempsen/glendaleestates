// Phase 2 Task 3: behaviour cases for generateQuoteLines beyond the fixture parity sweep.
import { test, expect, describe } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { serverPricingFromRows } from '../supabase/functions/_shared/loadServerPricing';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '../src/lib/upgradeCostData';
import { baseSpecFor, LAUNDRY_DEFAULT_PRODUCT } from '../src/lib/baseSpec';
import { STAIR_CARPET_LABEL, LAUNDRY_ROW_LABEL } from '../src/lib/outputLabels';
import { generateQuoteLines, sumQuoteLines, type GenerateInput, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';

const snapshot = pricingSnapshot as unknown as PricingSnapshot;
const pricing = serverPricingFromRows({
  pricing_config: snapshot.pricing_config,
  upgrade_materials: snapshot.upgrade_materials.filter((m) => m.is_active),
  unit_area_data: snapshot.unit_area_data,
});
type Row = Parameters<typeof toBuyerPdfSelections>[0];
const rows = liveSubmissions as unknown as Row[];
const rowFor = (unit: string) => rows.find((r) => r.unit_number === unit)!;

type Sel = GenerateInput['selections'];
const base: Sel = { areaUpgrades: [], bedroomFlooringChoice: '', additionalWindowsQty: 0, patioDoorsQty: 0, automatedWindowsQty: 0 };
const gen = (code: string, sel: Partial<Sel>) =>
  generateQuoteLines({ selections: { ...base, ...sel }, unitTypeCode: code, pricing, baseSpec: baseSpecFor(code) });
const fromRow = (unit: string) => {
  const row = rowFor(unit);
  const code = normalizeUnitTypeCode(row.unit_type);
  return generateQuoteLines({ selections: toBuyerPdfSelections(row), unitTypeCode: code, pricing, baseSpec: baseSpecFor(code) });
};
const byField = (lines: QuoteLine[], f: string) => lines.filter((l) => l.wizard_field === f);

describe('bedroom premium carpet / underpad', () => {
  test('Type C carpet bedroom + premium underpad, hard second bedroom → one Primary Bedroom line, 44 sqyd × 9.60 = 422.40', () => {
    const lines = gen('C', {
      bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true,
      areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp', productName: '', productColor: '' }],
    });
    const underpad = lines.filter((l) => /underpad/i.test(l.label));
    expect(underpad).toHaveLength(1);
    const [u] = underpad;
    expect(u.location).toBe('Primary Bedroom');
    expect(u.label).toBe('Premium underpad');
    expect(u.quantity).toBe(44);
    expect(u.unit).toBe('sqyd');
    expect(u.unit_price).toBe(9.6);
    expect(u.amount).toBe(422.4);
    expect(u.status).toBe('upgrade');
    expect(u.section).toBe('flooring');
    expect(u.pricing_mode).toBe('catalog');
    expect(u.material_key).toBe('premium_carpet_underpad');
    expect(u.wizard_field).toBe('premium_underpad_bedroom');
  });

  test('both bedrooms carpet → "Bedrooms", primary + second sqyd', () => {
    const [u] = byField(gen('C', { bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true }), 'premium_underpad_bedroom');
    expect(u.location).toBe('Bedrooms');
    expect(u.quantity).toBe(68);
  });

  test('LVP bedrooms ignore the premium flags (engine inactive)', () => {
    const lines = gen('C', { bedroomFlooringChoice: 'lvp', premiumUnderpadBedroom: true, premiumCarpetBedroom: true });
    expect(byField(lines, 'premium_underpad_bedroom')).toHaveLength(0);
    expect(byField(lines, 'premium_carpet_bedroom')).toHaveLength(0);
  });

  test('G-2 bedroom sqyd rule: G units take bedroom sqyd from G-2 whatever the upgrade floor', () => {
    for (const [code, floor] of [['G', '1'], ['G', null], ['G-1', null], ['G', '2']] as const) {
      const sel = { bedroomFlooringChoice: 'carpet' as const, premiumCarpetBedroom: true, upgradeFloorSelection: floor };
      const [c] = byField(gen(code, sel), 'premium_carpet_bedroom');
      expect(c.quantity).toBe(120);
      expect(c.location).toBe('Bedrooms');
      expect(c.amount).toBe(4800);
    }
  });
});

describe('office custom items', () => {
  const office = (status: string, extra: Record<string, unknown> = {}) => gen('C', {
    customPricing: { customItems: [{ id: 'x', label: 'Gazebo floor', area: 'Basement', status, ...extra }] },
  }).filter((l) => l.source === 'office');

  test('pending item → amount null, status pending, not in total, listed in notInTotal', () => {
    const lines = office('pending', { amount: 500 });
    expect(lines).toHaveLength(1);
    expect(lines[0].status).toBe('pending');
    expect(lines[0].amount).toBeNull();
    const sum = sumQuoteLines(lines, 0.05);
    expect(sum.subtotal).toBe(0);
    expect(sum.notInTotal).toHaveLength(1);
  });

  test('status map: disputed → under_review, deferred → deferred, included → included at $0', () => {
    expect(office('disputed', { amount: 1005 })[0]).toMatchObject({ status: 'under_review', amount: 1005 });
    expect(office('deferred')[0]).toMatchObject({ status: 'deferred', amount: null });
    expect(office('included', { amount: 0 })[0]).toMatchObject({ status: 'included', amount: 0, pricing_mode: 'included' });
  });

  test('upgrade with quantity × unit price; area drives the section', () => {
    const [l] = office('upgrade', { quantity: 3, unitPrice: 12.5, unit: 'sqft' });
    expect(l).toMatchObject({ status: 'upgrade', amount: 37.5, quantity: 3, unit_price: 12.5, unit: 'sqft', section: 'basement', location: 'Basement' });
  });

  test('removed is never emitted, even for an unknown or "removed" office status', () => {
    for (const s of ['removed', 'bogus']) {
      const lines = office(s, { amount: 10 });
      expect(lines.every((l) => l.status !== 'removed')).toBe(true);
      expect(sumQuoteLines(lines, 0.05).subtotal).toBe(0);
    }
    for (const r of rows) expect(fromRow(r.unit_number).some((l) => l.status === 'removed')).toBe(false);
  });

  test('Unit 24: one premium underpad line (the office line), disputed stairs under review, basement deferred', () => {
    const lines = fromRow('24');
    expect(lines.filter((l) => /underpad/i.test(l.label) && l.location === 'Primary Bedroom')).toHaveLength(1);
    const stairs = lines.find((l) => l.source === 'office' && l.location === 'Stairs to Lower Level')!;
    expect(stairs).toMatchObject({ status: 'under_review', amount: 1005, section: 'stairs' });
    expect(lines.find((l) => l.source === 'office' && /Basement/.test(l.label))).toMatchObject({ status: 'deferred', amount: null, section: 'basement' });
  });
});

describe('included / standard lines', () => {
  test('included bedroom shade → status included, amount 0, client_visible true, one per bedroom', () => {
    const shades = gen('C', {}).filter((l) => l.section === 'window_coverings' && l.status === 'included');
    expect(shades.map((l) => l.location)).toEqual(['Primary Bedroom', 'Second Bedroom']);
    for (const s of shades) expect(s).toMatchObject({ amount: 0, client_visible: true, pricing_mode: 'included' });
    expect(gen('G', {}).filter((l) => l.section === 'window_coverings' && l.status === 'included')).toHaveLength(1);
  });

  test('an office included shade replaces the base-spec shade for that room (Unit 24)', () => {
    const shades = fromRow('24').filter((l) => l.section === 'window_coverings' && l.status === 'included');
    expect(shades).toHaveLength(2);
    expect(shades.every((l) => l.source === 'office')).toBe(true);
  });

  test('laundry row uses LAUNDRY_DEFAULT_PRODUCT', () => {
    const laundry = gen('C', {}).filter((l) => l.location === LAUNDRY_ROW_LABEL && l.section === 'standard');
    expect(laundry).toHaveLength(1);
    expect(laundry[0].product_name).toBe(LAUNDRY_DEFAULT_PRODUCT);
    expect(laundry[0]).toMatchObject({ status: 'included', amount: 0 });
  });

  test('standard stair line uses the buyer wording (en dash) and the chosen colour', () => {
    const [s] = fromRow('38').filter((l) => l.section === 'standard' && l.location === 'Stairs to Lower Level');
    expect(s.label).toBe(STAIR_CARPET_LABEL);
    expect(s.label).toBe('Stair Flooring – Carpet');
    expect(s.product_colour).toBe('Sawgrass 701');
  });

  test('basement is not included: deferred, no amount', () => {
    const [b] = gen('C', {}).filter((l) => l.section === 'basement');
    expect(b).toMatchObject({ status: 'deferred', amount: null, location: 'Basement' });
  });

  test('provisional selection marks its line and carries the note to the client', () => {
    const [main] = fromRow('24').filter((l) => l.section === 'standard' && l.location === 'Main Living');
    expect(main.provisional).toBe(true);
    expect(main.client_note).toBe('To be chosen by the buyer at the Nov 26 meeting');
  });
});

describe('overrides', () => {
  test('amount override → manual, override ref, engine amount and label (Unit 31)', () => {
    const lines = fromRow('31');
    const [shower] = byField(lines, 'custom_tiled_shower');
    expect(shower).toMatchObject({ pricing_mode: 'manual', price_source_ref: 'override:customShower', amount: 9400, section: 'bathroom' });
    expect(shower.label).toBe('Tiled Shower - Walls, Floor, Drain + Waterproofing, Shower wall extends out');
    // Label-only override keeps the flat rate.
    const [pad] = byField(lines, 'premium_underpad_stairs');
    expect(pad).toMatchObject({ pricing_mode: 'flat_rate', price_source_ref: 'config:premium_underpad_stairs_price', amount: 165 });
    expect(pad.label).toBe('Premium Underpad — Stairs to Upper Level');
  });

  test('override of 0 → included $0 line with the override ref (never a $0 upgrade); total is 0', () => {
    const sel = { backsplashGrout: { enabled: true, groutColor: 'black', comments: '' }, customPricing: { overrides: { grout: { amount: 0 } } } };
    const lines = gen('C', sel);
    const [g] = byField(lines, 'backsplash_grout_enabled');
    expect(g).toMatchObject({ amount: 0, status: 'included', pricing_mode: 'included', price_source_ref: 'override:grout', section: 'backsplash' });
    expect(sumQuoteLines(lines, 0.05).subtotal).toBe(0);
  });

  test('stair override 0 with carpet also selected: LVP still wins, no carpet line', () => {
    const lines = gen('C', { stairUpgradeType: 'lvp', stairPremiumCarpetSelected: true, customPricing: { overrides: { stair: { amount: 0 } } } });
    expect(byField(lines, 'stair_premium_carpet_selected')).toHaveLength(0);
    expect(byField(lines, 'stair_upgrade_type')[0]).toMatchObject({ amount: 0, status: 'included', pricing_mode: 'included', price_source_ref: 'override:stair', section: 'stairs' });
  });
});

describe('windows, heated floors, ordering', () => {
  test('Unit 24: one line per patio door and a Somfy motorization line per motorized opening', () => {
    const win = fromRow('24').filter((l) => l.section === 'window_coverings' && l.status === 'upgrade');
    expect(win.map((l) => [l.location, l.label, l.amount])).toEqual([
      ['Patio Door 1', 'Patio door panel track', 2680.5],
      ['Patio Door 2', 'Patio door panel track', 2680.5],
      ['Patio Door 1', 'Somfy motorization', 645],
      ['Patio Door 2', 'Somfy motorization', 645],
    ]);
    expect(sumQuoteLines(fromRow('24'), 0.05).windowCoverings).toBe(6651);
  });

  test('Unit 4: additional window line priced from pricing_config', () => {
    const [w] = byField(fromRow('4'), 'additional_windows_qty');
    expect(w).toMatchObject({ unit_price: 673.5, amount: 673.5, pricing_mode: 'flat_rate', price_source_ref: 'config:additional_window_price' });
  });

  test('area heated floor applies only when no bathroom count is set', () => {
    const area = [{ areaId: 'masterEnsuite', materialType: 'tile', heatedFloor: true, productName: '', productColor: '' }];
    expect(byField(gen('C', { areaUpgrades: area }), 'area_upgrades[masterEnsuite].heatedFloor')).toHaveLength(1);
    expect(byField(gen('C', { areaUpgrades: area, heatedFloorBathrooms: 1 }), 'area_upgrades[masterEnsuite].heatedFloor')).toHaveLength(0);
  });

  test('sections appear in spec order', () => {
    const order = ['standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other'];
    for (const r of rows) {
      const idx = fromRow(r.unit_number).map((l) => order.indexOf(l.section));
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });

  test('prices come from pricing, not constants: doubling markup changes catalog lines only', () => {
    const p2 = { ...pricing, markupPercentage: 1.2, config: { ...pricing.config, patio_door_price: 1000 } };
    const lines = generateQuoteLines({ selections: toBuyerPdfSelections(rowFor('24')), unitTypeCode: 'C', pricing: p2, baseSpec: baseSpecFor('C') });
    expect(byField(lines, 'patio_doors_qty')[0].amount).toBe(1000);
    expect(byField(lines, 'area_upgrades[mainLiving]')[0].amount).toBeCloseTo(2068, 6);
  });
});

// ---- Fix round 1: robustness, Phase 1 engine rules (values pinned from computeUpgradeTotals before Task 18), window cap ----

/** Generator pricing from an edited copy of the fixture snapshot. */
function pricingFrom(edit: (s: PricingSnapshot) => void) {
  const snap = JSON.parse(JSON.stringify(snapshot)) as PricingSnapshot;
  edit(snap);
  return serverPricingFromRows({ pricing_config: snap.pricing_config, upgrade_materials: snap.upgrade_materials.filter((m) => m.is_active), unit_area_data: snap.unit_area_data });
}
/** Runs the generator on a crafted input; returns the lines and their totals. */
function both(code: string, sel: Partial<Sel>, p = pricing) {
  const selections = { ...base, ...sel } as Sel;
  const lines = generateQuoteLines({ selections, unitTypeCode: code, pricing: p, baseSpec: baseSpecFor(code) });
  return { lines, sum: sumQuoteLines(lines, 0.05) };
}

describe('robustness on real rows', () => {
  test('area row with a missing materialType → a $0 line, as the engine prices it', () => {
    const { lines, sum } = both('C', { areaUpgrades: [{ areaId: 'laundry' } as never] });
    const [l] = byField(lines, 'area_upgrades[laundry]');
    expect(l).toMatchObject({ amount: 0, status: 'upgrade', label: 'Upgrade', material_key: null, location: 'Laundry Room' });
    expect(sum.subtotal).toBe(0);
  });

  test('null baseSpec → no standard rows, no throw', () => {
    const lines = generateQuoteLines({ selections: base, unitTypeCode: 'C', pricing, baseSpec: null as never });
    expect(lines.filter((l) => l.section === 'standard')).toHaveLength(0);
    expect(generateQuoteLines({ selections: toBuyerPdfSelections(rowFor('24')), unitTypeCode: 'C', pricing, baseSpec: undefined as never }).length).toBeGreaterThan(0);
  });

  test('every fixture row with custom_pricing null / {} / "garbage" runs without throwing', () => {
    for (const cpValue of [null, {}, 'garbage']) {
      for (const r of rows) {
        const row = { ...r, custom_pricing: cpValue } as unknown as Row;
        const code = normalizeUnitTypeCode(row.unit_type);
        const lines = generateQuoteLines({ selections: toBuyerPdfSelections(row), unitTypeCode: code, pricing, baseSpec: baseSpecFor(code) });
        expect(lines.some((l) => l.source === 'office')).toBe(false);
        expect(Number.isFinite(sumQuoteLines(lines, 0.05).subtotal)).toBe(true);
      }
    }
  });
});

describe('Phase 1 engine rules (values pinned from computeUpgradeTotals)', () => {
  test('ov() active gate: an override on an unselected piece is ignored', () => {
    const { lines, sum } = both('C', { stairPremiumCarpetSelected: false, customPricing: { overrides: { stairCarpet: { amount: 700 }, grout: { amount: 50 } } } });
    expect(sum.subtotal).toBe(0);
    expect(byField(lines, 'stair_premium_carpet_selected')).toHaveLength(0);
  });

  test('bathroom tile (Section 4) is not priced when a bathroom area row is already tile', () => {
    const { lines, sum } = both('C', {
      bathroomTileSelected: true, bathroomTileEnsuiteSelected: true, bathroomTileGuestSelected: true,
      areaUpgrades: [{ areaId: 'masterEnsuite', materialType: 'tile', productName: '', productColor: '' }],
    });
    expect(byField(lines, 'bathroom_tile_selected')).toHaveLength(0);
    expect(sum.subtotal).toBeCloseTo(2176, 6); // the area row only
  });

  test('guest bathroom tile only counts a positive guest area', () => {
    const p = pricingFrom((s) => { s.unit_area_data.find((a) => a.unit_type_code === 'C')!.guest_bathroom = -10; });
    const { lines, sum } = both('C', { bathroomTileSelected: true, bathroomTileEnsuiteSelected: true, bathroomTileGuestSelected: true }, p);
    const [t] = byField(lines, 'bathroom_tile_selected');
    expect(t).toMatchObject({ quantity: 80, location: 'Primary Ensuite' });
    expect(t.amount).toBeCloseTo(2176, 6);
    expect(sum.subtotal).toBeCloseTo(2176, 6);
  });

  test('legacy row: master tile flag without sub-flags tiles both bathrooms', () => {
    const { lines, sum } = both('C', { bathroomTileSelected: true });
    const [t] = byField(lines, 'bathroom_tile_selected');
    expect(t).toMatchObject({ quantity: 140, location: 'Main Bathroom & Primary Ensuite' });
    expect(t.amount).toBeCloseTo(3808, 6);
    expect(sum.subtotal).toBeCloseTo(3808, 6);
  });

  test('stairs area row is skipped unless the office set a manual price', () => {
    const plain = both('C', { areaUpgrades: [{ areaId: 'stairs', materialType: 'carpet', productName: '', productColor: '' }] });
    expect(plain.sum.subtotal).toBe(0);
    expect(byField(plain.lines, 'area_upgrades[stairs]')).toHaveLength(0);
    const manual = both('C', { areaUpgrades: [{ areaId: 'stairs', materialType: 'carpet', manualPrice: 900, productName: '', productColor: '' }] });
    expect(byField(manual.lines, 'area_upgrades[stairs]')[0]).toMatchObject({ amount: 900, section: 'stairs', pricing_mode: 'manual' });
    expect(manual.sum.subtotal).toBe(900);
  });

  test('premium stair LVP falls back to the LVP price when the premium price is 0', () => {
    const p = pricingFrom((s) => { s.pricing_config.find((c) => c.config_key === 'stair_premium_lvp_upgrade_price')!.config_value = 0; });
    const { lines, sum } = both('C', { stairUpgradeType: 'premium_lvp', stairLvpUpgradeSelected: true }, p);
    expect(byField(lines, 'stair_upgrade_type')[0]).toMatchObject({ amount: 2160, price_source_ref: 'config:stair_lvp_upgrade_price' });
    expect(sum.subtotal).toBe(2160);
  });
});

describe('window quantity cap', () => {
  test('quantities above 50 itemise 50 lines and add one under_review line with the raw quantity', () => {
    const lines = gen('C', { patioDoorsQty: 1e7, additionalWindowsQty: 2 });
    expect(byField(lines, 'patio_doors_qty')).toHaveLength(50);
    expect(byField(lines, 'additional_windows_qty')).toHaveLength(2);
    const review = lines.filter((l) => l.label === 'Window coverings — quantity needs review');
    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({ status: 'under_review', amount: null, client_visible: true, section: 'window_coverings' });
    expect(review[0].internal_note).toContain('patio_doors_qty=10000000');
    expect(lines.length).toBeLessThan(200);
  });

  test('exactly 50 needs no review line', () => {
    const lines = gen('C', { additionalWindowsQty: 50 });
    expect(byField(lines, 'additional_windows_qty')).toHaveLength(50);
    expect(lines.some((l) => l.status === 'under_review')).toBe(false);
  });
});
