import { test, expect } from 'bun:test';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';

const pricing: UpgradeTotalsPricing = {
  markupPercentage: 0.6, gstRate: 0.05, getMaterialCost: () => 5, getGroutColorFee: () => 0,
  getAdditionalWindowPrice: () => 0, getPatioDoorPrice: () => 0, getAutomatedMotorPrice: () => 0,
  getHeatedFloorPrice: () => 0, getStairLvpUpgradePrice: () => 0, getUnitAreaData: () => ({}),
};
const run = (items: unknown[]) => computeUpgradeTotals({ unitTypeCode: 'C', areaUpgrades: [], customPricing: { customItems: items as never } }, pricing);

test('qty x unit price: 2 x $637.50 = $1,275', () => {
  expect(run([{ id: 'a', label: 'Blinds', quantity: 2, unitPrice: 637.5 }]).grandSubtotal).toBe(1275);
});
test('pending, under-review and deferred lines are left out of the total', () => {
  const t = run([
    { id: 'a', label: 'Charged', amount: 1000 },
    { id: 'b', label: 'Pending', status: 'pending', amount: null },
    { id: 'c', label: 'Disputed', status: 'disputed', amount: 1005 },
    { id: 'd', label: 'Deferred', status: 'deferred', amount: 500 },
    { id: 'e', label: 'Standard', status: 'included', amount: 0 },
  ]);
  expect(t.grandSubtotal).toBe(1000);
  // Included lines are listed separately (Standard Selections), not under "Not Included in Total".
  expect(t.pieces.uncommittedItems.length).toBe(3);
  expect(t.pieces.includedItems.map(i => i.label)).toEqual(['Standard']);
});
test('a pending line is shown as Pending, never as $0', () => {
  expect(run([{ id: 'b', label: 'P', status: 'pending', amount: 200 }]).pieces.uncommittedItems[0].amount).toBeNull();
});
test('GST is 5% of the committed subtotal', () => {
  expect(run([{ id: 'a', label: 'x', amount: 9681 }]).gst).toBeCloseTo(484.05, 2);
});
