// Phase 2 Task 15 (spec §6.11, line 35): the QuickBooks Online estimate is built 1:1 from quote_lines by the pure
// mapper in _shared/qboLinesMap.ts. SKU scheme GLEN-{SECTION}-{material_key | slug(label)}, Amount = line amount,
// totals = sumQuoteLines to the cent (Phase 1 engine pins on all nine live units), unpriced counted lines block the
// sync, included/deferred lines are not sent, and no internal text reaches a QBO description.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, enginePricingFromRows, engineTotalsForRow, type SubmissionRow } from './lib/generateInputFromRow';
import { countsInTotal, generateQuoteLines, sumQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { estimateLinesFromQuoteLines, qboSku, qboSlug, QBO_UNPRICED_REASON } from '../supabase/functions/_shared/qboLinesMap.ts';

// Copied verbatim from scripts/parity.test.ts (EXPECTED_SUBTOTALS); these pins never change.
const EXPECTED_SUBTOTALS: Record<string, number> = {
  '2': 2460, '4': 14334, '7': 3296.7, '24': 10388.4, '27': 0, '31': 27263, '37': 10488.5, '38': 2680.5, '43': 23865,
};

const pricing = enginePricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const GST = pricing.serverPricing.gstRate;
const cents = (n: number) => Math.round(n * 100);
const linesFor = (row: SubmissionRow) => generateQuoteLines(buildGenerateInputFromRow(row, pricing.serverPricing));
const line = (over: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 900, section: 'other', location: 'Kitchen', label: 'Test line', unit: 'flat', pricing_mode: 'manual',
  status: 'upgrade', client_visible: true, source: 'office', provisional: false, amount: 100, ...over,
});

describe('totals equal sumQuoteLines and the Phase 1 engine pins on every live unit', () => {
  for (const row of rows) {
    test(`Unit ${row.unit_number}`, () => {
      const lines = linesFor(row);
      const sum = sumQuoteLines(lines, GST);
      const { client, server } = engineTotalsForRow(row, pricing);
      const r = estimateLinesFromQuoteLines(lines, { gstRate: GST });
      // Unit 24 carries a priced but disputed `under_review` line (stairs carpet, $1,005): under_review blocks the sync
      // (controller ruling), whatever its amount; the totals are still the console's.
      const held = lines.filter((l) => l.status === 'pending' || l.status === 'under_review').map((l) => l.id ?? `sort:${l.sort_order}`);
      if (String(row.unit_number) === '24') expect(held.length).toBe(1);
      expect(r.blocked).toEqual(held.length ? { reason: QBO_UNPRICED_REASON, lineIds: held } : undefined);
      // Pins unchanged; both engines agree.
      expect(cents(r.subtotal)).toBe(cents(EXPECTED_SUBTOTALS[String(row.unit_number)]));
      expect(cents(r.subtotal)).toBe(cents(client.grandSubtotal));
      expect(cents(r.subtotal)).toBe(cents(server.grandSubtotal));
      expect(cents(r.gst)).toBe(cents(client.gst));
      expect(cents(r.total)).toBe(cents(client.grandTotal));
      // Equal to sumQuoteLines exactly (no separate arithmetic).
      expect(r.subtotal).toBe(sum.subtotal);
      expect(r.gst).toBe(sum.gst);
      expect(r.total).toBe(sum.total);
      // 1:1 — one estimate line per counted line, Amount = line amount, and the Amounts sum to the subtotal.
      const counted = lines.filter(countsInTotal);
      expect(r.lines.length).toBe(counted.length);
      counted.forEach((l, i) => expect(r.lines[i].Amount).toBe(l.amount as number));
      expect(r.lines.reduce((a, l) => a + cents(l.Amount), 0)).toBe(cents(sum.subtotal));
      // QBO arithmetic holds on every line: Qty × UnitPrice = Amount (to the cent).
      for (const l of r.lines) expect(cents(l.Qty * l.UnitPrice)).toBe(cents(l.Amount));
    });
  }
});

describe('SKU scheme GLEN-{SECTION}-{material_key | slug(label)}', () => {
  test('material_key wins, section upper-cased', () => {
    expect(qboSku(line({ section: 'flooring', material_key: 'carpet', label: 'Premium carpet' }))).toBe('GLEN-FLOORING-carpet');
    expect(qboSku(line({ section: 'window_coverings', material_key: null, label: 'Roller shade' }))).toBe('GLEN-WINDOW_COVERINGS-roller-shade');
  });
  test('slug fallback: lowercase a–z0–9 joined by "-", trimmed', () => {
    expect(qboSlug('  Premium LVP — Custom Stair Nosings!! ')).toBe('premium-lvp-custom-stair-nosings');
    expect(qboSku(line({ section: 'stairs', label: 'LVP with Custom Stair Nosings' }))).toBe('GLEN-STAIRS-lvp-with-custom-stair-nosings');
    expect(qboSku(line({ section: 'other', label: '***' }))).toBe('GLEN-OTHER-item');
  });
  test('slug capped at 40 characters (no trailing "-")', () => {
    const s = qboSlug('An extremely long office custom item label that goes on and on forever');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
    expect(s).toBe('an-extremely-long-office-custom-item-lab');
    expect(qboSku(line({ label: 'a'.repeat(80) }))).toBe(`GLEN-OTHER-${'a'.repeat(40)}`);
  });
  test('material_key sanitised to [a-z0-9_-]; whole SKU capped at 100 (QBO Name)', () => {
    expect(qboSku(line({ section: 'flooring', material_key: ' Premium Carpet/Underpad ' }))).toBe('GLEN-FLOORING-premium-carpet-underpad');
    expect(qboSku(line({ section: 'flooring', material_key: 'premium_carpet_underpad' }))).toBe('GLEN-FLOORING-premium_carpet_underpad');
    const long = qboSku(line({ section: 'flooring', material_key: 'k'.repeat(150) }));
    expect(long.length).toBe(100);
    expect(long.startsWith('GLEN-FLOORING-kkk')).toBe(true);
  });
  test('the SKU prefix can be passed (qbo_settings.item_sku_prefix); every SKU fits QBO Name (≤ 100)', () => {
    expect(qboSku(line({ section: 'tile', material_key: 'tile' }), 'GLEN-')).toBe('GLEN-TILE-tile');
    for (const row of rows) for (const l of estimateLinesFromQuoteLines(linesFor(row), { gstRate: GST }).lines) {
      expect(l.sku.length).toBeLessThanOrEqual(100);
      expect(l.sku).toMatch(/^GLEN-[A-Z_]+-[a-z0-9_-]+$/);
    }
  });
});

describe('quantity and unit price', () => {
  test('Qty = quantity, UnitPrice = amount / qty when it divides to the cent', () => {
    const r = estimateLinesFromQuoteLines([line({ quantity: 4, unit: 'each', unit_price: 673.5, amount: 2694 })], { gstRate: GST });
    expect(r.lines[0]).toMatchObject({ Qty: 4, UnitPrice: 673.5, Amount: 2694 });
  });
  test('otherwise Qty 1 and UnitPrice = amount', () => {
    const r = estimateLinesFromQuoteLines([line({ quantity: 3, unit: 'sqft', amount: 100 })], { gstRate: GST });
    expect(r.lines[0]).toMatchObject({ Qty: 1, UnitPrice: 100, Amount: 100 });
  });
  test('no quantity → Qty 1', () => {
    expect(estimateLinesFromQuoteLines([line({ quantity: null, amount: 250 })], { gstRate: GST }).lines[0]).toMatchObject({ Qty: 1, UnitPrice: 250 });
  });
});

describe('sub-cent amounts', () => {
  test('Amount is rounded to the cent for QBO; Σ Amount can then differ from the subtotal (the function flags it)', () => {
    const r = estimateLinesFromQuoteLines([line({ amount: 12.345 }), line({ amount: 12.345 })], { gstRate: GST });
    expect(r.lines.map((l) => l.Amount)).toEqual([12.35, 12.35]);
    expect(cents(r.subtotal)).toBe(2469);
    expect(cents(r.lines.reduce((a, l) => a + l.Amount, 0))).toBe(2470);
  });
});

describe('what is sent', () => {
  const lines: QuoteLine[] = [
    line({ id: 'inc', status: 'included', amount: 0, pricing_mode: 'included', label: 'Standard LVP' }),
    line({ id: 'def', status: 'deferred', amount: null, label: 'Basement flooring' }),
    line({ id: 'rem', status: 'removed', amount: 500, label: 'Removed thing' }),
    line({ id: 'up', status: 'upgrade', amount: 640, label: 'Custom grout colour', section: 'backsplash' }),
  ];
  test('included, deferred and removed lines are not sent; upgrades are', () => {
    const r = estimateLinesFromQuoteLines(lines, { gstRate: GST });
    expect(r.blocked).toBeUndefined();
    expect(r.lines.map((l) => l.lineId)).toEqual(['up']);
    expect(r.subtotal).toBe(640);
    expect(r.total).toBe(sumQuoteLines(lines, GST).total);
  });
  for (const status of ['pending', 'under_review'] as const) {
    test(`a ${status} line blocks the sync with its id`, () => {
      const r = estimateLinesFromQuoteLines([...lines, line({ id: 'p1', status, amount: null })], { gstRate: GST });
      expect(r.blocked).toEqual({ reason: QBO_UNPRICED_REASON, lineIds: ['p1'] });
      expect(QBO_UNPRICED_REASON).toBe('quote has unpriced lines');
    });
  }
  test('an upgrade line with no amount blocks the sync', () => {
    const r = estimateLinesFromQuoteLines([...lines, line({ id: 'u0', amount: null })], { gstRate: GST });
    expect(r.blocked?.lineIds).toEqual(['u0']);
  });
});

describe('descriptions are buyer-safe', () => {
  test('location · label · product/colour, plus the client note; never the internal note', () => {
    const r = estimateLinesFromQuoteLines([line({
      location: 'Master Bedroom', label: 'Premium carpet', product_name: 'Luxor II', product_colour: 'Winterbrooke 898',
      client_note: 'Colour confirmed Nov 26', internal_note: 'INTERNAL-ONLY: supplier backorder risk',
    })], { gstRate: GST });
    expect(r.lines[0].Description).toBe('Primary Bedroom · Premium carpet · Luxor II — Winterbrooke 898 — Colour confirmed Nov 26');
  });
  test('no internal note text in any description on the live units', () => {
    for (const row of rows) {
      const lines = linesFor(row).map((l, i) => ({ ...l, internal_note: `INTERNAL-ONLY-${i}` }));
      for (const l of estimateLinesFromQuoteLines(lines, { gstRate: GST }).lines) expect(l.Description).not.toContain('INTERNAL-ONLY');
    }
  });
});

describe('qbo-sync-submission reads lines, not the engine', () => {
  test('no engine import or call; the mapper is the only source of amounts', () => {
    const dir = new URL('../supabase/functions/qbo-sync-submission/', import.meta.url);
    for (const f of ['index.ts', 'handler.ts']) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      expect(src).not.toMatch(/upgradeTotalsServer|computeUpgradeTotals|calculateUpgradePricing/);
    }
    expect(readFileSync(new URL('handler.ts', dir), 'utf8')).toContain('estimateLinesFromQuoteLines(');
  });
});
