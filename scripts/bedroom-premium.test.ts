// Bedroom premium carpet / underpad pricing rules (Phase 1 audit #2), on the quote-line generator since Task 18.
import { test, expect } from 'bun:test';
import { generateQuoteLines, sumQuoteLines, type GenerateInput, type QuotePricing } from '../supabase/functions/_shared/quoteLines';

const pricing: QuotePricing = {
  materials: { carpet: 25, premium_carpet_underpad: 6 }, config: {},
  unitAreas: { C: { masterBedroom: 44, secondBedroomCarpet: 24 } }, markupPercentage: 0.6, gstRate: 0.05,
};
type Sel = GenerateInput['selections'];
const gen = (sel: Partial<Sel>, p = pricing, code = 'C') => generateQuoteLines({
  selections: { areaUpgrades: [], bedroomFlooringChoice: '', ...sel } as Sel, unitTypeCode: code, pricing: p, baseSpec: [],
});
const field = (sel: Partial<Sel>, f: string, p = pricing, code = 'C') => gen(sel, p, code).filter((l) => l.wizard_field === f);

test('both bedrooms carpet, underpad selected: 68 sq yd × 6 × 1.6', () => {
  const [u] = field({ bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true }, 'premium_underpad_bedroom');
  expect(u.quantity).toBe(68);
  expect(u.amount).toBeCloseTo(652.8, 2);
});

test('second bedroom hard surface is excluded; the line is Primary Bedroom', () => {
  const [u] = field({
    bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true,
    areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp' } as never],
  }, 'premium_underpad_bedroom');
  expect(u.amount).toBeCloseTo(422.4, 2);
  expect(u.location).toBe('Primary Bedroom');
});

test('premium carpet priced: 68 × 25 × 1.6', () => {
  const [c] = field({ bedroomFlooringChoice: 'carpet', premiumCarpetBedroom: true }, 'premium_carpet_bedroom');
  expect(c.amount).toBeCloseTo(2720, 2);
  expect(c).toMatchObject({ location: 'Bedrooms', label: 'Premium carpet', unit: 'sqyd' });
});

test('lvp bedroom choice prices nothing', () => {
  const lines = gen({ bedroomFlooringChoice: 'lvp', premiumCarpetBedroom: true, premiumUnderpadBedroom: true });
  expect(lines.filter((l) => /bedroom/.test(l.wizard_field || ''))).toHaveLength(0);
  expect(sumQuoteLines(lines, 0.05).subtotal).toBe(0);
});

test('office override on underpad replaces the amount', () => {
  const [u] = field({
    bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true,
    customPricing: { overrides: { bedroomUnderpad: { amount: 400 } } },
  }, 'premium_underpad_bedroom');
  expect(u.amount).toBe(400);
  expect(u.price_source_ref).toBe('override:bedroomUnderpad');
});

test('split-floor G/H read bedroom sq yd from the -2 row regardless of upgrade floor', () => {
  const gh: QuotePricing = { ...pricing, unitAreas: { 'G-1': { masterBedroom: 0 }, 'G-2': { masterBedroom: 120, secondBedroomCarpet: 0 } } };
  for (const floor of ['1', '2', null] as const) {
    const [u] = field({ bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true, upgradeFloorSelection: floor }, 'premium_underpad_bedroom', gh, 'G');
    expect(u.amount).toBeCloseTo(1152, 2);
  }
});

test('bedroomUnderpad override of 0 is an included $0 line (the Unit 7 waiver), never counted', () => {
  const lines = gen({
    bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true,
    customPricing: { overrides: { bedroomUnderpad: { amount: 0 } } },
  });
  const [u] = lines.filter((l) => l.wizard_field === 'premium_underpad_bedroom');
  expect(u).toMatchObject({ status: 'included', amount: 0, pricing_mode: 'included' });
  expect(sumQuoteLines(lines, 0.05).subtotal).toBe(0);
});
