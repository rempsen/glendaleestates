// Phase 2 Task 3 (lines only since Task 18, when the Phase 1 engines that were the oracle were deleted): generated
// quote lines on every live unit — subtotal to the cent = the pins, one window line per opening, valid vocabulary,
// deterministic. Line-for-line parity with both engines was proven here until Task 18 (commit history).
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines, sumQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { PINNED_SUBTOTALS as EXPECTED_SUBTOTALS } from './lib/parityPins';

const snapshot = pricingSnapshot as unknown as PricingSnapshot;
// Shared with scripts/backfill-quote-lines.ts: the backfill builds its inputs with exactly these functions.
const pricing = pricingFromRows(snapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];

function engines(row: SubmissionRow) {
  return { lines: generateQuoteLines(buildGenerateInputFromRow(row, pricing)) };
}

const counted = (lines: QuoteLine[]) => lines.filter((l) => l.status === 'upgrade' && l.amount != null);
const show = (ls: QuoteLine[]) => ls.map((l) => `${l.wizard_field}:${l.location}/${l.label}=${l.amount}`);

test('fixture holds all nine live submissions', () => {
  expect(rows.length).toBe(9);
});

describe('generateQuoteLines on the live units', () => {
  for (const row of rows) {
    const unit = row.unit_number;
    test(`Unit ${unit}: subtotal to the cent = pin; total = subtotal + GST`, () => {
      const { lines } = engines(row);
      const sum = sumQuoteLines(lines, 0.05);
      expect(EXPECTED_SUBTOTALS[unit]).toBeDefined();
      expect(sum.subtotal.toFixed(2)).toBe(EXPECTED_SUBTOTALS[unit].toFixed(2));
      expect((sum.upgrades + sum.windowCoverings).toFixed(2)).toBe(sum.subtotal.toFixed(2));
      expect(sum.total).toBeCloseTo(sum.subtotal + sum.gst, 6);
    });

    test(`Unit ${unit}: one window line per opening at the pricing_config unit price`, () => {
      const { lines } = engines(row);
      const win = counted(lines).filter((l) => l.section === 'window_coverings');
      for (const l of win) { expect(l.quantity).toBe(1); expect(l.unit).toBe('each'); expect(l.amount).toBe(l.unit_price as number); }
      expect(win.filter((l) => l.wizard_field === 'additional_windows_qty')).toHaveLength(row.additional_windows_qty || 0);
      expect(win.filter((l) => l.wizard_field === 'patio_doors_qty')).toHaveLength(row.patio_doors_qty || 0);
      expect(win.filter((l) => l.wizard_field === 'automated_windows_qty')).toHaveLength(row.automated_windows_qty || 0);
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
