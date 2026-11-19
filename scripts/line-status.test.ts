// Office line statuses (custom_pricing.customItems[].status) on the generator: only counted upgrades are in the total.
import { test, expect } from 'bun:test';
import { generateQuoteLines, sumQuoteLines, type GenerateInput, type QuotePricing } from '../supabase/functions/_shared/quoteLines';

const pricing: QuotePricing = { materials: {}, config: {}, unitAreas: {}, markupPercentage: 0.6, gstRate: 0.05 };
const run = (items: unknown[]) => {
  const lines = generateQuoteLines({
    selections: { areaUpgrades: [], bedroomFlooringChoice: '', customPricing: { customItems: items as never } } as GenerateInput['selections'],
    unitTypeCode: 'C', pricing, baseSpec: [],
  }).filter((l) => l.source === 'office');
  return { lines, t: sumQuoteLines(lines, pricing.gstRate) };
};

test('qty x unit price: 2 x $637.50 = $1,275', () => {
  expect(run([{ id: 'a', label: 'Gazebo', quantity: 2, unitPrice: 637.5 }]).t.subtotal).toBe(1275);
});
test('pending, under-review and deferred lines are left out of the total; included is not "not in total"', () => {
  const { lines, t } = run([
    { id: 'a', label: 'Charged', amount: 1000 },
    { id: 'b', label: 'Pending', status: 'pending', amount: null },
    { id: 'c', label: 'Disputed', status: 'disputed', amount: 1005 },
    { id: 'd', label: 'Deferred', status: 'deferred', amount: 500 },
    { id: 'e', label: 'Standard', status: 'included', amount: 0 },
  ]);
  expect(t.subtotal).toBe(1000);
  expect(t.notInTotal.map((l) => l.status)).toEqual(['pending', 'under_review', 'deferred']);
  expect(lines.find((l) => l.label === 'Standard')?.status).toBe('included');
});
test('a pending line is shown as Pending, never as $0', () => {
  expect(run([{ id: 'b', label: 'P', status: 'pending', amount: 200 }]).lines[0].amount).toBeNull();
});
test('GST is 5% of the committed subtotal', () => {
  expect(run([{ id: 'a', label: 'x', amount: 9681 }]).t.gst).toBeCloseTo(484.05, 2);
});
