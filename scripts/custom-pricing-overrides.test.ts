import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { OVERRIDES } from '../src/lib/customPricingOverrides';
import { generateQuoteLines, type GenerateInput, type QuotePricing } from '../supabase/functions/_shared/quoteLines';

// custom_pricing is read-only since Task 18; OVERRIDES labels the keys the generator still honours.
const generatorKeys = () =>
  [...new Set([...readFileSync(new URL('../supabase/functions/_shared/quoteLines.ts', import.meta.url), 'utf8').matchAll(/\b(?:ov|bedroomPiece)\('([a-zA-Z]+)'/g)].map(m => m[1]))].sort();

test('OVERRIDES lists every override key the generator prices', () => {
  expect(OVERRIDES.map(o => o.key).sort()).toEqual(generatorKeys());
});
test('bedroom premium rows use the agreed labels', () => {
  expect(OVERRIDES.find(o => o.key === 'bedroomCarpet')?.title).toBe('Primary Bedroom premium carpet');
  expect(OVERRIDES.find(o => o.key === 'bedroomUnderpad')?.title).toBe('Primary Bedroom premium underpad');
});
test('Unit 7 waiver path: bedroomUnderpad override amount 0 zeroes the charge', () => {
  const pricing: QuotePricing = { materials: { premium_carpet_underpad: 6 }, config: {}, unitAreas: { A: { masterBedroom: 30, secondBedroomCarpet: 17 } }, markupPercentage: 0.6, gstRate: 0.05 };
  const sel = { areaUpgrades: [], bedroomFlooringChoice: 'carpet', premiumUnderpadBedroom: true } as unknown as GenerateInput['selections'];
  const amount = (s: GenerateInput['selections']) =>
    generateQuoteLines({ selections: s, unitTypeCode: 'A', pricing, baseSpec: [] }).find((l) => l.wizard_field === 'premium_underpad_bedroom')!;
  expect(amount(sel).amount).toBeGreaterThan(0);
  expect(amount({ ...sel, customPricing: { overrides: { bedroomUnderpad: { amount: 0 } } } })).toMatchObject({ amount: 0, status: 'included' });
});
