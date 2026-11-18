// Phase 2 Task 4: RunningTotal view model. All arithmetic is sumQuoteLines; the model only filters, orders and formats.
import { test, expect, describe } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { serverPricingFromRows } from '../supabase/functions/_shared/loadServerPricing';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '../src/lib/upgradeCostData';
import { baseSpecFor } from '../src/lib/baseSpec';
import { generateQuoteLines, type QuoteLine } from '@/lib/quoteLines';
import { buildRunningTotalModel, formatMoney } from '../src/components/quote/runningTotalModel';

const snapshot = pricingSnapshot as unknown as PricingSnapshot;
const serverPricing = serverPricingFromRows({
  pricing_config: snapshot.pricing_config,
  upgrade_materials: snapshot.upgrade_materials.filter((m) => m.is_active),
  unit_area_data: snapshot.unit_area_data,
});
type Row = Parameters<typeof toBuyerPdfSelections>[0];
const row24 = (liveSubmissions as unknown as Array<Row & { unit_number?: string }>).find((r) => String(r.unit_number) === '24') as Row;
const code = row24.unit_type ? normalizeUnitTypeCode(row24.unit_type) : null;
const unit24 = generateQuoteLines({
  selections: toBuyerPdfSelections(row24), unitTypeCode: code, pricing: serverPricing, baseSpec: baseSpecFor(code),
});
const gst = serverPricing.gstRate;

const line = (over: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 1, section: 'flooring', location: 'Kitchen', label: 'Test', unit: 'flat', pricing_mode: 'manual',
  status: 'upgrade', client_visible: true, source: 'office', provisional: false, amount: 100, ...over,
});

describe('buildRunningTotalModel', () => {
  test('fixture found', () => expect(unit24.length).toBeGreaterThan(0));

  test('Unit 24 total is 10388.40 x 1.05', () => {
    const m = buildRunningTotalModel(unit24, gst, { buyerView: false });
    expect(m.rows.find((r) => r.label === 'Total')!.amountText).toBe('$10,907.82');
    expect(m.rows.find((r) => r.label === 'Subtotal')!.amountText).toBe('$10,388.40');
  });

  test('rows are in fixed order with exact labels', () => {
    const m = buildRunningTotalModel(unit24, gst, { buyerView: false });
    expect(m.rows.map((r) => r.label)).toEqual(['Upgrades', 'Window coverings', 'Subtotal', 'GST 5%', 'Total']);
  });

  test('included lines are not listed; counted lines are', () => {
    const lines = [line({ label: 'Std', status: 'included', amount: null }), line({ label: 'Up', amount: 50 })];
    const m = buildRunningTotalModel(lines, 0.05, { buyerView: false });
    expect(m.counted.map((c) => c.label)).toEqual(['Up']);
    expect(m.notInTotal).toEqual([]);
  });

  test('pending line shows Pending, never $0.00', () => {
    const lines = [line({ label: 'Mystery', status: 'pending', amount: null }), line({ label: 'Zero', status: 'deferred', amount: 0 })];
    const m = buildRunningTotalModel(lines, 0.05, { buyerView: false });
    expect(m.notInTotal[0].amountText).toBe('Pending');
    expect(m.notInTotal[0].statusLabel).toBe('Pending');
    expect(JSON.stringify(m.notInTotal[0])).not.toContain('$0.00');
    expect(m.notInTotal[1].statusLabel).toBe('Deferred');
  });

  test('buyerView drops client_visible=false from counted, not-in-total and sums', () => {
    const lines = [
      line({ label: 'Visible', amount: 100 }),
      line({ label: 'Internal', amount: 1000, client_visible: false }),
      line({ label: 'InternalPending', status: 'pending', amount: null, client_visible: false }),
    ];
    const staff = buildRunningTotalModel(lines, 0.05, { buyerView: false });
    const buyer = buildRunningTotalModel(lines, 0.05, { buyerView: true });
    expect(staff.counted).toHaveLength(2);
    expect(staff.notInTotal).toHaveLength(1);
    expect(buyer.counted.map((c) => c.label)).toEqual(['Visible']);
    expect(buyer.notInTotal).toEqual([]);
    expect(buyer.rows.find((r) => r.label === 'Total')!.amountText).toBe('$105.00');
  });

  test('removed lines never appear', () => {
    const lines = [line({ label: 'Gone', status: 'removed', amount: 500 }), line({ label: 'Here', amount: 10 })];
    const m = buildRunningTotalModel(lines, 0.05, { buyerView: false });
    expect(m.counted.map((c) => c.label)).toEqual(['Here']);
    expect(m.notInTotal).toEqual([]);
    expect(m.rows.find((r) => r.label === 'Upgrades')!.amount).toBe(10);
  });

  test('window coverings split from upgrades', () => {
    const lines = [line({ amount: 100 }), line({ section: 'window_coverings', location: 'Living', amount: 200 })];
    const m = buildRunningTotalModel(lines, 0.05, { buyerView: false });
    expect(m.rows.find((r) => r.label === 'Upgrades')!.amount).toBe(100);
    expect(m.rows.find((r) => r.label === 'Window coverings')!.amount).toBe(200);
  });

  test('formatMoney', () => {
    expect(formatMoney(1005)).toBe('$1,005.00');
    expect(formatMoney(10907.82)).toBe('$10,907.82');
  });
});
