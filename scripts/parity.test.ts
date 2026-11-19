// Parity pins (lines only since Phase 2 Task 18): the nine live submissions' pre-GST subtotals, from
// sumQuoteLines(generateQuoteLines(input)). They are the Phase 1 engine values and must not move by a cent.
// Motorization backfill check (spec section 8, item 8), recorded 2026-11-18: comparing window_total against
// ((additional x 673.50) + (patio x 2,680.50)) x 1.05 implied motorization only for Unit 24 (already backfilled).
// Units 2, 4 and 38 carry window_total values from older price lists (3,172.37 / 3,172.37 / 2,984.94) and get no
// backfill. No further writes were made.
import { test, expect } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { generatedTotalsForRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { PINNED_SUBTOTALS } from './lib/parityPins';

const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];

test('fixture holds all nine live submissions', () => {
  expect(rows.length).toBe(9);
  expect(Object.keys(PINNED_SUBTOTALS).sort()).toEqual(rows.map((r) => String(r.unit_number)).sort());
});

test('pre-GST subtotal (sum of counted lines) matches the pinned value to the cent for every live submission', () => {
  for (const row of rows) {
    const { totals } = generatedTotalsForRow(row, pricing);
    expect(totals.subtotal.toFixed(2)).toBe(PINNED_SUBTOTALS[String(row.unit_number)].toFixed(2));
  }
});

test('total is subtotal plus GST at the configured rate for every live submission', () => {
  expect(pricing.gstRate).toBe(0.05);
  for (const row of rows) {
    const { totals } = generatedTotalsForRow(row, pricing);
    expect(totals.total).toBeCloseTo(totals.subtotal + totals.gst, 6);
    expect(totals.gst).toBeCloseTo(totals.subtotal * 0.05, 6);
  }
});
