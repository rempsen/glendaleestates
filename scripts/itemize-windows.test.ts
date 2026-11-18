import { test, expect } from 'bun:test';
import { itemizeWindows } from '../src/lib/itemizeWindows';
import { computeUpgradeTotals, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';
import { computeUpgradeTotalsServer, type ServerPricing } from '../supabase/functions/_shared/upgradeTotalsServer';
import type { BuyerSelections } from '../src/lib/buyerPdfGenerator';

const pricing: UpgradeTotalsPricing = {
  markupPercentage: 0.6, gstRate: 0.05, getMaterialCost: () => 5, getGroutColorFee: () => 0,
  getAdditionalWindowPrice: () => 673.5, getPatioDoorPrice: () => 2680.5, getAutomatedMotorPrice: () => 495,
  getHeatedFloorPrice: () => 0, getStairLvpUpgradePrice: () => 0, getUnitAreaData: () => ({}),
};
const sel = (o: Partial<BuyerSelections>) => ({ additionalWindowsQty: 0, patioDoorsQty: 0, automatedWindowsQty: 0, ...o }) as BuyerSelections;
const noLocations = { additional: [], patio: [], motorized: [], includedBedrooms: [] };

test('2 additional windows become 2 located lines at 673.50', () => {
  const r = itemizeWindows(sel({ additionalWindowsQty: 2 }), pricing, { ...noLocations, additional: ['Living Room', 'Front Entrance'] });
  expect(r.customItems.length).toBe(2);
  expect(r.customItems.map(i => i.label)).toEqual(['Roller shade, 5% openness — Living Room', 'Roller shade, 5% openness — Front Entrance']);
  for (const i of r.customItems) expect([i.quantity, i.unit, i.unitPrice, i.status]).toEqual([1, 'each', 673.5, 'upgrade']);
  expect(r.patch).toEqual({ additional_windows_qty: 0, patio_doors_qty: 0, automated_windows_qty: 0 });
});

test('2 patio + 2 motorized produce 4 lines at the configured prices', () => {
  const r = itemizeWindows(sel({ patioDoorsQty: 2, automatedWindowsQty: 2 }), pricing, { ...noLocations, patio: ['Patio Door 1', 'Patio Door 2'], motorized: ['Living Room', 'Primary Bedroom'] });
  expect(r.customItems.map(i => [i.label, i.unitPrice])).toEqual([
    ['Patio door panel track — Patio Door 1', 2680.5], ['Patio door panel track — Patio Door 2', 2680.5],
    ['Somfy motorization — Living Room', 495], ['Somfy motorization — Primary Bedroom', 495],
  ]);
});

test('bedrooms add included $0 blackout lines', () => {
  const r = itemizeWindows(sel({ additionalWindowsQty: 1 }), pricing, { ...noLocations, additional: ['Living Room'], includedBedrooms: [{ label: 'Primary Bedroom', qty: 1 }] });
  const inc = r.customItems.filter(i => i.status === 'included');
  expect(inc.length).toBe(1);
  expect([inc[0].label, inc[0].unitPrice]).toEqual(['Blackout roller shade — Primary Bedroom', 0]);
});

test('itemizing moves cost from the window quantities to custom lines without changing the subtotal', () => {
  const s = sel({ additionalWindowsQty: 2, patioDoorsQty: 1, automatedWindowsQty: 1 });
  const before = computeUpgradeTotals({ unitTypeCode: null, areaUpgrades: [], additionalWindowsQty: 2, patioDoorsQty: 1, automatedWindowsQty: 1 }, pricing).grandSubtotal;
  const r = itemizeWindows(s, pricing, { ...noLocations, additional: ['A', 'B'], patio: ['P'], motorized: ['M'] });
  const after = computeUpgradeTotals({ unitTypeCode: null, areaUpgrades: [], customPricing: { customItems: r.customItems } }, pricing).grandSubtotal;
  expect(after).toBeCloseTo(before, 2);
});

test('idempotent: already-itemized (all quantities 0) is a no-op', () => {
  const r = itemizeWindows(sel({}), pricing, { ...noLocations, additional: ['Living Room'], patio: ['P'], motorized: ['M'], includedBedrooms: [{ label: 'Primary Bedroom', qty: 1 }] });
  expect(r.customItems).toEqual([]);
  expect(r.patch).toEqual({});
});

test('includedItems: included lines leave uncommittedItems (client and server engines)', () => {
  const items = [{ id: 'a', label: 'Blackout roller shade — Primary Bedroom', status: 'included', area: 'Windows' }, { id: 'b', label: 'P', status: 'pending', amount: null }];
  const t = computeUpgradeTotals({ unitTypeCode: null, areaUpgrades: [], customPricing: { customItems: items as never } }, pricing);
  expect(t.pieces.includedItems).toEqual([{ label: 'Blackout roller shade — Primary Bedroom', detail: undefined, area: 'Windows' }]);
  expect(t.pieces.uncommittedItems.map(u => u.label)).toEqual(['P']);
  const sp: ServerPricing = { materials: {}, config: {}, unitAreas: {}, markupPercentage: 0.6, gstRate: 0.05 };
  const st = computeUpgradeTotalsServer({ unitTypeCode: null, areaUpgrades: [], customPricing: { customItems: items } } as never, sp);
  expect(st.pieces.includedItems).toEqual([{ label: 'Blackout roller shade — Primary Bedroom', detail: undefined, area: 'Windows' }]);
});

test('a blank location name falls back to a numbered label; line count equals quantity, subtotal unchanged', () => {
  const before = computeUpgradeTotals({ unitTypeCode: null, areaUpgrades: [], additionalWindowsQty: 2 }, pricing).grandSubtotal;
  const r = itemizeWindows(sel({ additionalWindowsQty: 2 }), pricing, { ...noLocations, additional: ['Living Room', '  '] });
  expect(r.customItems.map(i => i.label)).toEqual(['Roller shade, 5% openness — Living Room', 'Roller shade, 5% openness — Window 2']);
  const after = computeUpgradeTotals({ unitTypeCode: null, areaUpgrades: [], customPricing: { customItems: r.customItems } }, pricing).grandSubtotal;
  expect(after).toBeCloseTo(before, 2);
});
