import { test, expect } from 'bun:test';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';

const pricing: UpgradeTotalsPricing = {
  markupPercentage: 0.6, gstRate: 0.05,
  getMaterialCost: (m) => (m === 'tiled_shower' ? 3000 : m === 'tile' ? 10 : 5),
  getGroutColorFee: () => 300, getAdditionalWindowPrice: () => 673.5, getPatioDoorPrice: () => 2347.8,
  getAutomatedMotorPrice: () => 495, getHeatedFloorPrice: () => 1650, getStairLvpUpgradePrice: () => 2160,
  getUnitAreaData: () => ({ allLvp: 800, guestBathroom: 50, masterEnsuite: 60 }),
};

const unit31 = {
  unitTypeCode: 'E',
  areaUpgrades: [
    { areaId: 'allLvp', materialType: 'lvp', manualPrice: 10120 },
    { areaId: 'guestBathroom', materialType: 'tile', manualPrice: 1796 },
    { areaId: 'masterEnsuite', materialType: 'tile', manualPrice: 1932, heatedFloor: true },
  ] as never,
  backsplashGrout: { enabled: true, groutColor: 'black', comments: '' },
  bathroomTileSelected: true, heatedFloorBathrooms: 1, customTiledShower: true,
  customPricing: { overrides: {
    heatedFloor: { amount: 2450 }, customShower: { amount: 9400 }, grout: { amount: 1400 },
  } },
};

test('Unit 31 office prices give a $27,098 subtotal before GST', () => {
  expect(computeUpgradeTotals(unit31, pricing).grandSubtotal).toBeCloseTo(27098, 2);
});
test('GST of 5% is added on top of office prices', () => {
  const t = computeUpgradeTotals(unit31, pricing);
  expect(t.gst).toBeCloseTo(1354.9, 2);
  expect(t.grandTotal).toBeCloseTo(28452.9, 2);
});
test('custom line items use quantity x unit price and add to the subtotal', () => {
  const t = computeUpgradeTotals({ ...unit31, customPricing: { ...unit31.customPricing, customItems: [{ id: 'a', label: 'Closet tile', quantity: 20, unitPrice: 15 }] } }, pricing);
  expect(t.grandSubtotal).toBeCloseTo(27398, 2);
});
test('an override does not charge for an upgrade that is switched off', () => {
  const t = computeUpgradeTotals({ ...unit31, customTiledShower: false }, pricing);
  expect(t.pieces.customShower).toBe(0);
});

const stairPricing = { ...pricing, getStairCarpetUpgradePrice: () => 840, getStairUnderpadUpgradePrice: () => 165 };
const base = { unitTypeCode: 'E', areaUpgrades: [] as never, stairUpgradeType: 'standard' };
test('premium carpet and underpad for stairs to lower level are both charged ($840 + $165)', () => {
  const t = computeUpgradeTotals({ ...base, stairPremiumCarpetSelected: true, stairPremiumUnderpadSelected: true }, stairPricing);
  expect(t.grandSubtotal).toBeCloseTo(1005, 2);
  expect(t.grandTotal).toBeCloseTo(1055.25, 2);
});
test('stair carpet upgrades are not charged when stairs are upgraded to LVP', () => {
  const t = computeUpgradeTotals({ ...base, stairUpgradeType: 'lvp', stairPremiumCarpetSelected: true, stairPremiumUnderpadSelected: true }, stairPricing);
  expect(t.pieces.stairCarpet + t.pieces.stairUnderpad).toBe(0);
});
