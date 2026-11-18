import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { OVERRIDES } from '../src/lib/customPricingOverrides';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';

const engineKeys = (path: string) =>
  [...new Set([...readFileSync(new URL(path, import.meta.url), 'utf8').matchAll(/\bov\('([a-zA-Z]+)'/g)].map(m => m[1]))].sort();

test('Custom Pricing panel lists every override key the client engine prices', () => {
  expect(OVERRIDES.map(o => o.key).sort()).toEqual(engineKeys('../src/lib/upgradeTotals.ts'));
});
test('... and every key the server engine prices', () => {
  expect(OVERRIDES.map(o => o.key).sort()).toEqual(engineKeys('../supabase/functions/_shared/upgradeTotalsServer.ts'));
});
test('bedroom premium rows use the agreed labels', () => {
  expect(OVERRIDES.find(o => o.key === 'bedroomCarpet')?.title).toBe('Primary Bedroom premium carpet');
  expect(OVERRIDES.find(o => o.key === 'bedroomUnderpad')?.title).toBe('Primary Bedroom premium underpad');
});
test('Unit 7 waiver path: bedroomUnderpad override amount 0 (what the panel writes for "0") zeroes the charge', () => {
  const pricing: UpgradeTotalsPricing = {
    markupPercentage: 0.6, gstRate: 0.05, getMaterialCost: k => (k === 'premium_carpet_underpad' ? 6 : 0),
    getGroutColorFee: () => 0, getAdditionalWindowPrice: () => 0, getPatioDoorPrice: () => 0, getAutomatedMotorPrice: () => 0,
    getHeatedFloorPrice: () => 0, getStairLvpUpgradePrice: () => 0, getStairPremiumLvpUpgradePrice: () => 0,
    getStairCarpetUpgradePrice: () => 0, getStairUnderpadUpgradePrice: () => 0,
    getUnitAreaData: () => ({ masterBedroom: 30, secondBedroomCarpet: 17 } as any),
  };
  const input = { unitTypeCode: 'A', areaUpgrades: [], bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true } as any;
  expect(computeUpgradeTotals(input, pricing).pieces.bedroomUnderpad).toBeGreaterThan(0);
  expect(computeUpgradeTotals({ ...input, customPricing: { overrides: { bedroomUnderpad: { amount: 0 } } } }, pricing).pieces.bedroomUnderpad).toBe(0);
});
