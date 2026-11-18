// Renderer-level guard: the buyer PDF's Premium Upgrades rows must sum to the engine's upgradesSubtotal.
import { test, expect } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import { loadFixturePricing, type PricingSnapshot } from './lib/fixturePricing';
import { computeUpgradeTotals } from '../src/lib/upgradeTotals';
import { buildPremiumUpgradeRows, totalsInputFromSelections } from '../src/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '../src/lib/upgradeCostData';

const pricing = loadFixturePricing(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as Parameters<typeof toBuyerPdfSelections>[0][];
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);

function rowsFor(row: (typeof rows)[number]) {
  const sel = toBuyerPdfSelections(row);
  const unitCode = row.unit_type ? normalizeUnitTypeCode(row.unit_type) : null;
  const totals = computeUpgradeTotals(totalsInputFromSelections(sel, unitCode), pricing);
  return { totals, upgradeRows: buildPremiumUpgradeRows(sel, pricing, totals) };
}

for (const row of rows) {
  test(`Unit ${row.unit_number}: PDF upgrade rows sum to upgradesSubtotal to the cent`, () => {
    const { totals, upgradeRows } = rowsFor(row);
    const sum = upgradeRows.reduce((t, r) => t + cents(r[1]), 0);
    expect(sum).toBe(Math.round(totals.upgradesSubtotal * 100));
    // The printed Section Subtotal is `$${upgradesSubtotal.toFixed(2)}`; it must equal the row sum.
    expect(cents(`$${totals.upgradesSubtotal.toFixed(2)}`)).toBe(sum);
  });
}

test('Unit 7 prints the Primary Bedroom premium underpad row ($451.20)', () => {
  const { upgradeRows } = rowsFor(rows.find(r => r.unit_number === '7')!);
  const underpad = upgradeRows.find(r => /Underpad/.test(r[0]) && /Bedroom/.test(r[0]));
  expect(underpad?.[1]).toBe('$451.20');
  expect(underpad?.[0].includes('Master')).toBe(false);
});
