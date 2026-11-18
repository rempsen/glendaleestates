import { test, expect } from 'bun:test';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';
import { buildCanonicalLines } from '../src/lib/submissionLineItems';

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

test('canonical lines include bedroom underpad and sum to the quoted subtotal', () => {
  const totals = computeUpgradeTotals({
    unitTypeCode: 'C',
    areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp' } as any],
    bedroomFlooringChoice: 'carpet',
    bedroomPremiumUnderpadSelected: true,
  }, pricing);
  const lines = buildCanonicalLines({} as any, totals as any);
  const u = lines.find(l => l.line_key === 'bedroom_underpad');
  expect(u?.amount).toBeCloseTo(422.4, 2);
  expect(u?.line_label).toContain('Primary Bedroom');
  expect(u?.unit_of_measure).toBe('sqyd');
  expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(totals.grandSubtotal, 2);
});

test('canonical lines include bedroom carpet', () => {
  const totals = computeUpgradeTotals({ unitTypeCode: 'C', areaUpgrades: [], bedroomFlooringChoice: 'carpet', bedroomPremiumCarpetSelected: true }, pricing);
  const lines = buildCanonicalLines({} as any, totals as any);
  expect(lines.find(l => l.line_key === 'bedroom_carpet')?.amount).toBeCloseTo(2720, 2);
  expect(lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(totals.grandSubtotal, 2);
});
