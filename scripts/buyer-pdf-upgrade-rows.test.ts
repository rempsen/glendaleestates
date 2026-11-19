// Renderer-level guard: the buyer PDF's Premium Upgrades rows (now built from quote lines, Phase 2 Task 10) must sum
// to the engine's upgradesSubtotal; window coverings are their own section and sum to windowSubtotal.
import { test, expect } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, pricingFromRows, referenceTotalsForRow, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines } from '../supabase/functions/_shared/quoteLines.ts';
import { buildLineRows } from '../src/lib/lineRenderRows';

const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);

function rowsFor(row: SubmissionRow) {
  const totals = referenceTotalsForRow(row, pricing);
  const model = buildLineRows(generateQuoteLines(buildGenerateInputFromRow(row, pricing)), { buyerView: true, gstRate: pricing.gstRate });
  const upgradeRows = model.upgrades.bySection.filter(s => s.section !== 'window_coverings').flatMap(s => s.rows);
  const windowRows = model.upgrades.bySection.filter(s => s.section === 'window_coverings').flatMap(s => s.rows);
  return { totals, model, upgradeRows, windowRows };
}

for (const row of rows) {
  test(`Unit ${row.unit_number}: PDF upgrade rows sum to upgradesSubtotal to the cent`, () => {
    const { totals, model, upgradeRows, windowRows } = rowsFor(row);
    const sum = upgradeRows.reduce((t, r) => t + cents(r.amount), 0);
    expect(sum).toBe(Math.round(totals.upgradesSubtotal * 100));
    expect(cents(model.totals.rows.find(r => r.label === 'Upgrades')!.amountText)).toBe(sum);
    expect(windowRows.reduce((t, r) => t + cents(r.amount), 0)).toBe(Math.round(totals.windowSubtotal * 100));
  });
}

test('Unit 7 prints the Primary Bedroom premium underpad row ($451.20)', () => {
  const { upgradeRows } = rowsFor(rows.find(r => r.unit_number === '7')!);
  const underpad = upgradeRows.find(r => /Underpad/i.test(r.item) && /Bedroom/.test(r.location + r.item));
  expect(underpad?.amount).toBe('$451.20');
  expect(underpad?.cells.join(' ').includes('Master')).toBe(false);
});
