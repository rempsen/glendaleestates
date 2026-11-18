// Phase 2 Task 3: generated quote lines must reproduce BOTH Phase 1 engines to the cent on every live unit,
// line for line. The engines stay the oracle until Task 18 deletes them.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import {
  buildGenerateInputFromRow, enginePricingFromRows, engineTotalsForRow, type SubmissionRow,
} from './lib/generateInputFromRow';
import { generateQuoteLines, sumQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { expectedLines, matchByKey } from './lib/engineLineKeys';

// Copied verbatim from scripts/parity.test.ts (EXPECTED_SUBTOTALS); these pins never change.
const EXPECTED_SUBTOTALS: Record<string, number> = {
  '2': 2460,
  '4': 14334,
  '7': 3296.7, // 2026-11-18: +451.20 premium underpad (flag was never priced); reported to Dan by the controller, no override written
  '24': 10388.4,
  '27': 0,
  // Engine subtotal 27,263.00 vs. the staff note of 2026-11-16 "$27,204.50 plus GST" (gap $58.50, origin unknown).
  // Pinned at the engine value on 2026-11-18; to be investigated in Phase 2 parity work.
  '31': 27263,
  '37': 10488.5,
  '38': 2680.5,
  '43': 23865,
};

const snapshot = pricingSnapshot as unknown as PricingSnapshot;
// Shared with scripts/backfill-quote-lines.ts: the backfill builds its inputs with exactly these functions.
const pricing = enginePricingFromRows(snapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];

function engines(row: SubmissionRow) {
  const { client, server } = engineTotalsForRow(row, pricing);
  const lines = generateQuoteLines(buildGenerateInputFromRow(row, pricing.serverPricing));
  return { client, server, lines };
}

const counted = (lines: QuoteLine[]) => lines.filter((l) => l.status === 'upgrade' && l.amount != null);
const show = (ls: QuoteLine[]) => ls.map((l) => `${l.wizard_field}:${l.location}/${l.label}=${l.amount}`);

test('fixture holds all nine live submissions', () => {
  expect(rows.length).toBe(9);
});

describe('generateQuoteLines parity with both engines', () => {
  for (const row of rows) {
    const unit = row.unit_number;
    test(`Unit ${unit}: subtotal to the cent = client engine = server engine = pin`, () => {
      const { client, server, lines } = engines(row);
      const sum = sumQuoteLines(lines, 0.05);
      expect(EXPECTED_SUBTOTALS[unit]).toBeDefined();
      expect(sum.subtotal.toFixed(2)).toBe(EXPECTED_SUBTOTALS[unit].toFixed(2));
      expect(sum.subtotal.toFixed(2)).toBe(client.grandSubtotal.toFixed(2));
      expect(sum.subtotal.toFixed(2)).toBe(server.grandSubtotal.toFixed(2));
      expect(sum.windowCoverings.toFixed(2)).toBe(client.windowSubtotal.toFixed(2));
      expect(sum.windowCoverings.toFixed(2)).toBe(server.windowSubtotal.toFixed(2));
      expect(sum.upgrades.toFixed(2)).toBe(client.upgradesSubtotal.toFixed(2));
      expect(sum.gst.toFixed(2)).toBe(client.gst.toFixed(2));
      expect(sum.total.toFixed(2)).toBe(client.grandTotal.toFixed(2));
    });

    test(`Unit ${unit}: line for line against client lineItems (wizard_field + amount + section)`, () => {
      const { client, lines } = engines(row);
      const exp = expectedLines(client.lineItems, { areaUpgrades: row.area_upgrades as never, customPricing: row.custom_pricing });
      const { unmatched, wrong, extra } = matchByKey(exp, lines);
      expect(unmatched).toEqual([]);
      expect(wrong).toEqual([]);
      // Strict: every counted line is an engine item (the client lists $0 area rows too).
      expect(show(extra)).toEqual([]);
    });

    test(`Unit ${unit}: line for line against server lineItems (wizard_field + amount + section)`, () => {
      const { server, lines } = engines(row);
      const exp = expectedLines(server.lineItems, { areaUpgrades: row.area_upgrades as never, customPricing: row.custom_pricing });
      const { unmatched, wrong, extra } = matchByKey(exp, lines);
      expect(unmatched).toEqual([]);
      expect(wrong).toEqual([]);
      // The server engine drops $0 area rows; those are the only counted lines it may lack.
      expect(show(extra.filter((l) => l.amount !== 0))).toEqual([]);
    });

    test(`Unit ${unit}: one window line per opening at the pricing_config unit price`, () => {
      const { client, lines } = engines(row);
      const win = counted(lines).filter((l) => l.section === 'window_coverings');
      for (const l of win) { expect(l.quantity).toBe(1); expect(l.unit).toBe('each'); expect(l.amount).toBe(l.unit_price as number); }
      expect(win.filter((l) => l.wizard_field === 'additional_windows_qty')).toHaveLength(row.additional_windows_qty || 0);
      expect(win.filter((l) => l.wizard_field === 'patio_doors_qty')).toHaveLength(row.patio_doors_qty || 0);
      expect(win.filter((l) => l.wizard_field === 'automated_windows_qty')).toHaveLength(row.automated_windows_qty || 0);
      const windowItems = client.lineItems.filter((li) => li.group === 'window').length;
      expect(windowItems).toBe([row.additional_windows_qty, row.patio_doors_qty, row.automated_windows_qty].filter((q) => (q || 0) > 0).length);
    });

    test(`Unit ${unit}: office items map one-to-one with engine includedItems and uncommittedItems`, () => {
      const { client, lines } = engines(row);
      const office = lines.filter((l) => l.source === 'office');
      expect(office.filter((l) => l.status === 'included')).toHaveLength(client.pieces.includedItems.length);
      const notCounted = office.filter((l) => l.status !== 'included' && !(l.status === 'upgrade' && l.amount != null));
      expect(notCounted.map((l) => l.amount)).toEqual(client.pieces.uncommittedItems.map((i) => i.amount));
    });

    test(`Unit ${unit}: vocabulary — no removed, valid enums, included lines at $0`, () => {
      const { lines } = engines(row);
      for (const l of lines) {
        expect(['included', 'upgrade', 'pending', 'under_review', 'deferred']).toContain(l.status);
        expect(['standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other']).toContain(l.section);
        expect(['sqft', 'sqyd', 'each', 'flat']).toContain(l.unit);
        expect(['catalog', 'flat_rate', 'manual', 'included']).toContain(l.pricing_mode);
        if (l.status === 'included') { expect(l.amount).toBe(0); expect(l.pricing_mode).toBe('included'); }
        if (l.status === 'pending') expect(l.amount).toBeNull();
        expect(l.label.trim().length).toBeGreaterThan(0);
        expect(l.label).not.toContain('Master Bedroom');
        expect(l.location).not.toContain('Master Bedroom');
      }
      const orders = lines.map((l) => l.sort_order);
      expect([...orders].sort((a, b) => a - b)).toEqual(orders);
      expect(new Set(orders).size).toBe(orders.length);
    });

    test(`Unit ${unit}: deterministic`, () => {
      expect(JSON.stringify(engines(row).lines)).toBe(JSON.stringify(engines(row).lines));
    });
  }
});

test('shared module has zero imports and no runtime globals', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/quoteLines.ts'), 'utf8');
  expect(src).not.toMatch(/^\s*import\s/m);
  expect(src).not.toMatch(/\brequire\(/);
  expect(src).not.toMatch(/\bDeno\./);
  expect(src).not.toMatch(/\bprocess\./);
  expect(src).not.toMatch(/\bwindow\./);
});

test('app re-export resolves to the same module', () => {
  const src = readFileSync(join(import.meta.dir, '../src/lib/quoteLines.ts'), 'utf8').trim();
  expect(src).toContain("export * from '@shared/quoteLines'");
});
