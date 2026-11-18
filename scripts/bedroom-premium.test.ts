import { test, expect } from 'bun:test';
import { computeUpgradeTotals, type UpgradeTotalsInput, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';

const pricing: UpgradeTotalsPricing = {
  markupPercentage: 0.6,
  gstRate: 0.05,
  getMaterialCost: k => (k === 'carpet' ? 25 : k === 'premium_carpet_underpad' ? 6 : 0),
  getGroutColorFee: () => 0,
  getAdditionalWindowPrice: () => 0,
  getPatioDoorPrice: () => 0,
  getAutomatedMotorPrice: () => 0,
  getHeatedFloorPrice: () => 0,
  getUnitAreaData: () => ({ masterBedroom: 44, secondBedroomCarpet: 24 }),
};

const base: UpgradeTotalsInput = { unitTypeCode: 'C', areaUpgrades: [] };

test('both bedrooms carpet, underpad selected', () => {
  const t = computeUpgradeTotals({ ...base, bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true }, pricing);
  expect(t.pieces.bedroomUnderpad).toBeCloseTo(652.8, 2);
  expect(t.pieces.bedroomCarpetSqyd).toBe(68);
});

test('second bedroom hard surface is excluded', () => {
  const t = computeUpgradeTotals({
    ...base, bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true,
    areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp' } as any],
  }, pricing);
  expect(t.pieces.bedroomUnderpad).toBeCloseTo(422.4, 2);
  expect(t.lineItems.some(l => l.label.includes('Primary Bedroom'))).toBe(true);
});

test('premium carpet priced', () => {
  const t = computeUpgradeTotals({ ...base, bedroomFlooringChoice: 'carpet', bedroomPremiumCarpetSelected: true }, pricing);
  expect(t.pieces.bedroomCarpet).toBeCloseTo(2720, 2);
  expect(t.lineItems.some(l => l.label === 'Premium Carpet — Bedrooms (68 sq yd)')).toBe(true);
});

test('lvp bedroom choice prices nothing', () => {
  const t = computeUpgradeTotals({ ...base, bedroomFlooringChoice: 'lvp', bedroomPremiumCarpetSelected: true, bedroomPremiumUnderpadSelected: true }, pricing);
  expect(t.pieces.bedroomCarpet).toBe(0);
  expect(t.pieces.bedroomUnderpad).toBe(0);
  expect(t.lineItems.filter(l => l.label.includes('Bedroom')).length).toBe(0);
});

test('office override on underpad', () => {
  const t = computeUpgradeTotals({
    ...base, bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true,
    customPricing: { overrides: { bedroomUnderpad: { amount: 400 } } } as any,
  }, pricing);
  expect(t.pieces.bedroomUnderpad).toBe(400);
});

test('split-floor G/H read bedroom sq yd from the -2 row regardless of upgrade floor', () => {
  const gh: UpgradeTotalsPricing = {
    ...pricing,
    getUnitAreaData: (code: string) =>
      code === 'G-1' ? ({ masterBedroom: 0 } as any)
      : code === 'G-2' ? ({ masterBedroom: 120, secondBedroomCarpet: 0 } as any)
      : null,
  };
  for (const floor of ['1', '2', null] as const) {
    const t = computeUpgradeTotals({
      unitTypeCode: 'G', upgradeFloorSelection: floor, areaUpgrades: [],
      bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true,
    }, gh);
    expect(t.pieces.bedroomUnderpad).toBeCloseTo(1152, 2);
  }
});

test('bedroomUnderpad override of 0 yields 0 and no line item', () => {
  const t = computeUpgradeTotals({
    ...base, bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true,
    customPricing: { overrides: { bedroomUnderpad: { amount: 0 } } } as any,
  }, pricing);
  expect(t.pieces.bedroomUnderpad).toBe(0);
  expect(t.lineItems.some(l => l.label.includes('Underpad'))).toBe(false);
});
