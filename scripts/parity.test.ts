// Parity baseline for the Phase 1 pricing cleanup.
// Motorization backfill check (spec section 8, item 8), recorded 2026-11-18: comparing window_total against
// ((additional x 673.50) + (patio x 2,680.50)) x 1.05 implied motorization only for Unit 24 (already backfilled).
// Units 2, 4 and 38 carry window_total values from older price lists (3,172.37 / 3,172.37 / 2,984.94) and get no
// backfill. No further writes were made.
import { test, expect } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import { loadFixturePricing, type PricingSnapshot } from './lib/fixturePricing';
import { computeUpgradeTotals } from '../src/lib/upgradeTotals';
import { totalsInputFromSelections } from '../src/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '../src/lib/upgradeCostData';

// Pre-GST grandSubtotal per unit, captured from the client engine at HEAD.
const EXPECTED_SUBTOTALS: Record<string, number> = {
  '2': 2460,
  '4': 14334,
  '7': 2845.5,
  '24': 10388.4,
  '27': 0,
  '31': 27263,
  '37': 10488.5,
  '38': 2680.5,
  '43': 23865,
};

const pricing = loadFixturePricing(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as Parameters<typeof toBuyerPdfSelections>[0][];

function totalsFor(row: (typeof rows)[number]) {
  const unitCode = row.unit_type ? normalizeUnitTypeCode(row.unit_type) : null;
  return computeUpgradeTotals(totalsInputFromSelections(toBuyerPdfSelections(row), unitCode), pricing);
}

test('fixture holds all nine live submissions', () => {
  expect(rows.length).toBe(9);
});

test('pre-GST subtotal matches the pinned value for every live submission', () => {
  for (const row of rows) {
    expect(EXPECTED_SUBTOTALS[row.unit_number]).toBeDefined();
    expect(totalsFor(row).grandSubtotal).toBeCloseTo(EXPECTED_SUBTOTALS[row.unit_number], 2);
  }
});

test('grandTotal is grandSubtotal plus 5% GST for every live submission', () => {
  for (const row of rows) {
    const t = totalsFor(row);
    expect(t.grandTotal).toBeCloseTo(t.grandSubtotal * 1.05, 2);
  }
});
