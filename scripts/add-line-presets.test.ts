// Phase 2 Task 8: Add-line presets resolve every number from Pricing Control (upgrade_materials / pricing_config /
// unit_area_data). Tests feed the pricing snapshot, then the same snapshot with every price changed, and assert the
// line follows the fixture — so no price can be a literal in code.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import {
  catalogLine, flatRateLine, manualLine, includedLine, pendingLine, catalogOptions, flatRateOptions, areaOptions,
  defaultLocation, defaultAssignee, FLAT_RATE_PRESETS, type PresetSource, type PresetPerson,
} from '../src/lib/addLinePresets';
import { baseSpecFor } from '../src/lib/baseSpec';

type Snap = typeof pricingSnapshot;
const areaFor = (snap: Snap, code: string) => {
  const r = snap.unit_area_data.find((u) => u.unit_type_code === code)!;
  return {
    allLvp: r.all_lvp, mainLiving: r.main_living, secondBedroom: r.second_bedroom, masterBedroomLvp: r.master_bedroom_lvp,
    masterBedroom: r.master_bedroom, secondBedroomCarpet: r.second_bedroom_carpet, guestBathroom: r.guest_bathroom,
    masterEnsuite: r.master_ensuite, laundry: r.laundry, backsplash: r.backsplash,
  };
};
function sourceFrom(snap: Snap, code = 'C'): PresetSource {
  const markup = Number(snap.pricing_config.find((c) => c.config_key === 'markup_percentage')!.config_value) / 100;
  return {
    markupPercentage: markup,
    materials: snap.upgrade_materials.filter((m) => m.is_active).map((m) => ({
      key: m.material_key, name: m.name, costPerUnit: Number(m.cost_per_unit), unit: m.unit_type as 'sqft' | 'sqyd' | 'flat',
    })),
    config: snap.pricing_config.map((c) => ({ config_key: c.config_key, config_value: Number(c.config_value), is_active: c.is_active })),
    unitAreas: areaFor(snap, code),
  };
}
/** Every price × 3 + 1, markup changed: a hardcoded number anywhere would no longer match. */
function scaled(snap: Snap): Snap {
  const s = structuredClone(snap) as Snap;
  s.upgrade_materials.forEach((m) => { m.cost_per_unit = Number(m.cost_per_unit) * 3 + 1; });
  s.pricing_config.forEach((c) => { c.config_value = c.config_key === 'markup_percentage' ? 25 : Number(c.config_value) * 3 + 1; });
  s.unit_area_data.forEach((u) => { u.main_living = u.main_living + 7; });
  return s;
}

const real = sourceFrom(pricingSnapshot);
const alt = sourceFrom(scaled(pricingSnapshot));
const mat = (src: PresetSource, k: string) => src.materials.find((m) => m.key === k)!;
const cfg = (src: PresetSource, k: string) => src.config.find((c) => c.config_key === k)!.config_value;

describe('catalog preset', () => {
  for (const [name, src] of [['snapshot', real], ['scaled', alt]] as const) {
    test(`LVP on Main Living (${name}): sqft from unit_area_data, unit price = cost × (1 + markup)`, () => {
      const r = catalogLine(src, { section: 'flooring', materialKey: 'lvp', areaId: 'mainLiving', location: 'Main Living' });
      if ('error' in r) throw new Error(r.error);
      const unitPrice = mat(src, 'lvp').costPerUnit * (1 + src.markupPercentage);
      expect(r).toMatchObject({
        section: 'flooring', location: 'Main Living', label: mat(src, 'lvp').name, material_key: 'lvp',
        quantity: src.unitAreas!.mainLiving, unit: 'sqft', pricing_mode: 'catalog', price_source_ref: 'material:lvp',
        status: 'upgrade', source: 'office', client_visible: true,
      });
      expect(r.unit_price).toBeCloseTo(unitPrice, 9);
      expect(r.amount).toBeCloseTo(unitPrice * src.unitAreas!.mainLiving!, 6);
    });
  }
  test('carpet keeps the material unit (sqyd)', () => {
    const r = catalogLine(real, { section: 'flooring', materialKey: 'carpet', areaId: 'masterBedroom', location: 'Primary Bedroom' });
    if ('error' in r) throw new Error(r.error);
    expect(r.unit).toBe('sqyd');
    expect(r.quantity).toBe(real.unitAreas!.masterBedroom);
  });
  test('no area → quantity typed by staff (amount null until a qty is entered)', () => {
    const r = catalogLine(real, { section: 'tile', materialKey: 'tile', location: 'Main Bathroom' });
    if ('error' in r) throw new Error(r.error);
    expect(r.quantity).toBeNull();
    expect(r.amount).toBeNull();
    const r2 = catalogLine(real, { section: 'tile', materialKey: 'tile', location: 'Main Bathroom', quantity: 12 });
    if ('error' in r2) throw new Error(r2.error);
    expect(r2.amount).toBeCloseTo(12 * mat(real, 'tile').costPerUnit * (1 + real.markupPercentage), 6);
  });
  test('flat material (tiled shower) is one flat unit', () => {
    const r = catalogLine(real, { section: 'bathroom', materialKey: 'tiled_shower', location: 'Primary Ensuite' });
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ unit: 'flat', quantity: 1 });
    expect(r.amount).toBeCloseTo(mat(real, 'tiled_shower').costPerUnit * (1 + real.markupPercentage), 6);
  });
  test('unknown material or area is an error, never a $0 line', () => {
    expect(catalogLine(real, { section: 'flooring', materialKey: 'marble', location: 'X' })).toHaveProperty('error');
    expect(catalogLine(real, { section: 'flooring', materialKey: 'lvp', areaId: 'garage', location: 'X' })).toHaveProperty('error');
    expect(catalogLine({ ...real, unitAreas: null }, { section: 'flooring', materialKey: 'lvp', areaId: 'mainLiving', location: 'X' })).toHaveProperty('error');
  });
  test('options come from the source only', () => {
    expect(catalogOptions(real).map((o) => o.key)).toEqual(real.materials.map((m) => m.key));
    expect(catalogOptions({ ...real, materials: [] })).toEqual([]);
    const areas = areaOptions(real);
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.every((a) => a.quantity > 0)).toBe(true);
    expect(areas.find((a) => a.areaId === 'mainLiving')!.quantity).toBe(real.unitAreas!.mainLiving);
    expect(areaOptions({ ...real, unitAreas: null })).toEqual([]);
  });
});

describe('flat-rate preset', () => {
  for (const [name, src] of [['snapshot', real], ['scaled', alt]] as const) {
    test(`every preset key prices from pricing_config (${name})`, () => {
      for (const p of FLAT_RATE_PRESETS) {
        const r = flatRateLine(src, { section: p.section, configKey: p.key, location: 'Somewhere' });
        if ('error' in r) throw new Error(`${p.key}: ${r.error}`);
        expect(r).toMatchObject({
          pricing_mode: 'flat_rate', price_source_ref: `config:${p.key}`, unit: p.unit, quantity: 1,
          unit_price: cfg(src, p.key), amount: cfg(src, p.key), status: 'upgrade', label: p.label,
        });
      }
    });
  }
  test('preset list is the agreed set and carries no prices', () => {
    expect(FLAT_RATE_PRESETS.map((p) => p.key).sort()).toEqual([
      'additional_window_price', 'automated_motor_price', 'grout_color_change_price', 'heated_floor_per_bathroom',
      'patio_door_price', 'stair_lvp_upgrade_price', 'stair_premium_lvp_upgrade_price',
    ]);
    for (const p of FLAT_RATE_PRESETS) expect(Object.values(p).some((v) => typeof v === 'number')).toBe(false);
    expect(FLAT_RATE_PRESETS.find((p) => p.key === 'additional_window_price')!.unit).toBe('each');
    expect(FLAT_RATE_PRESETS.find((p) => p.key === 'stair_lvp_upgrade_price')!.unit).toBe('flat');
  });
  test('quantity multiplies via lineAmount', () => {
    const r = flatRateLine(real, { section: 'window_coverings', configKey: 'additional_window_price', location: 'Living Room', quantity: 3 });
    if ('error' in r) throw new Error(r.error);
    expect(r.amount).toBeCloseTo(3 * cfg(real, 'additional_window_price'), 6);
  });
  test('inactive or missing config rows are not offered and cannot be added', () => {
    const off = { ...real, config: real.config.map((c) => c.config_key === 'patio_door_price' ? { ...c, is_active: false } : c) };
    expect(flatRateOptions(off).map((o) => o.key)).not.toContain('patio_door_price');
    expect(flatRateLine(off, { section: 'window_coverings', configKey: 'patio_door_price', location: 'X' })).toHaveProperty('error');
    const gone = { ...real, config: real.config.filter((c) => c.config_key !== 'grout_color_change_price') };
    expect(flatRateLine(gone, { section: 'backsplash', configKey: 'grout_color_change_price', location: 'X' })).toHaveProperty('error');
    expect(flatRateLine(real, { section: 'other', configKey: 'markup_percentage', location: 'X' })).toHaveProperty('error');
  });
  test('flat-rate options carry the live value for display', () => {
    const o = flatRateOptions(alt).find((x) => x.key === 'patio_door_price')!;
    expect(o.price).toBe(cfg(alt, 'patio_door_price'));
  });
});

describe('manual / included / request pricing', () => {
  test('manual: qty × unit price when both typed', () => {
    const r = manualLine({ section: 'other', location: 'Kitchen', label: 'Pot filler', quantity: 2, unit: 'each', unitPrice: 412.25 });
    expect(r).toMatchObject({ pricing_mode: 'manual', status: 'upgrade', quantity: 2, unit_price: 412.25, amount: 824.5, source: 'office' });
  });
  test('manual: a typed amount when no qty/unit price', () => {
    const r = manualLine({ section: 'stairs', location: 'Stairs to Lower Level', label: 'Premium carpet + underpad', unit: 'flat', amount: 1005 });
    expect(r).toMatchObject({ quantity: null, unit_price: null, amount: 1005, unit: 'flat' });
  });
  test('manual: nothing typed → amount null (counts nowhere, shows Pending)', () => {
    expect(manualLine({ section: 'other', location: 'X', label: 'Y', unit: 'each' }).amount).toBeNull();
  });
  test('included: status included, amount 0, pricing_mode included', () => {
    expect(includedLine({ section: 'window_coverings', location: 'Primary Bedroom', label: 'Blackout shade', productName: 'Graber' })).toMatchObject({
      status: 'included', amount: 0, pricing_mode: 'included', unit: 'flat', quantity: null, unit_price: null, product_name: 'Graber',
    });
  });
  test('request pricing: status pending, amount null, flagged to the chosen person', () => {
    expect(pendingLine({ section: 'basement', location: 'Basement', label: 'Premium underpad', flaggedTo: 'u-brian' })).toMatchObject({
      status: 'pending', amount: null, unit_price: null, flagged_to: 'u-brian', pricing_mode: 'manual',
    });
    expect(pendingLine({ section: 'other', location: 'X', label: 'Y' }).flagged_to).toBeNull();
  });
  test('labels are trimmed; blank label falls back to the section', () => {
    expect(manualLine({ section: 'other', location: ' Kitchen ', label: '  ', unit: 'each' })).toMatchObject({ label: 'Other', location: 'Kitchen' });
  });
});

describe('location presets and default assignee', () => {
  test('defaultLocation takes the first base-spec location of the section', () => {
    const spec = baseSpecFor('C');
    expect(defaultLocation('window_coverings', spec)).toBe('Primary Bedroom');
    expect(defaultLocation('basement', spec)).toBe('Basement');
    expect(defaultLocation('other', spec)).toBe('');
  });
  const people: PresetPerson[] = [
    { user_id: 'u-dan', name: 'Dan R', email: 'Dan@example.test' },
    { user_id: 'u-brian', name: 'Brian C', email: 'brian@example.test' },
    { user_id: 'u-noni', name: 'Noni R', email: 'noni@example.test' },
  ];
  const recipients = ['dan@example.test', 'brian@example.test', 'noni@example.test'];
  test('window coverings → Dan, flooring/tile/stairs/basement → Brian, only when on the recipients list', () => {
    expect(defaultAssignee('window_coverings', people, recipients)).toBe('u-dan');
    for (const s of ['flooring', 'tile', 'stairs', 'basement'] as const) expect(defaultAssignee(s, people, recipients)).toBe('u-brian');
    expect(defaultAssignee('other', people, recipients)).toBeNull();
  });
  test('no recipients row (or not on it) → no default', () => {
    expect(defaultAssignee('window_coverings', people, null)).toBeNull();
    expect(defaultAssignee('flooring', people, ['dan@example.test'])).toBeNull();
    expect(defaultAssignee('flooring', [], recipients)).toBeNull();
  });
});

describe('no price literals', () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
  test('addLinePresets.ts has no numeric literal other than 0 and 1', () => {
    const code = strip(readFileSync(new URL('../src/lib/addLinePresets.ts', import.meta.url), 'utf8'));
    const nums = (code.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []).filter((n) => n !== '0' && n !== '1');
    expect(nums).toEqual([]);
  });
});
