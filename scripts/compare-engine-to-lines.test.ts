// Bun mirror of supabase/functions/_shared/compareEngineToLines.test.ts, plus the 9 fixture units end to end.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, enginePricingFromRows, engineTotalsForRow, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines } from '../supabase/functions/_shared/quoteLines.ts';
import { compareEngineToLines } from '../supabase/functions/_shared/compareEngineToLines.ts';

const L = (section: string, status: string, amount: number | string | null) => ({ section, status, amount });

test('equal totals → ok, counts counted / not-in-total / included', () => {
  const r = compareEngineToLines({ grandSubtotal: 150, windowSubtotal: 50 }, [
    L('flooring', 'upgrade', 100), L('window_coverings', 'upgrade', 50), L('standard', 'included', 0),
    L('other', 'deferred', 999), L('other', 'pending', null), L('other', 'removed', 5000),
  ] as never);
  expect(r).toEqual({ engine_subtotal: 150, lines_subtotal: 150, diff: 0, windows_engine: 50, windows_lines: 50,
    windows_diff: 0, line_count: 6, counted_lines: 2, not_in_total: 2, ok: true });
});

test('a one-cent drift is FAIL; diff is lines − engine', () => {
  const r = compareEngineToLines({ grandSubtotal: 100, windowSubtotal: 0 }, [L('flooring', 'upgrade', 100.01)] as never);
  expect(r.ok).toBe(false);
  expect(r.diff).toBe(0.01);
});

test('window mismatch alone is FAIL', () => {
  const r = compareEngineToLines({ grandSubtotal: 100, windowSubtotal: 40 }, [L('flooring', 'upgrade', 100)] as never);
  expect(r.ok).toBe(false);
  expect(r.windows_diff).toBe(-40);
});

test('numeric strings from PostgREST are summed as numbers; float noise below half a cent is ok', () => {
  const r = compareEngineToLines({ grandSubtotal: 0.3, windowSubtotal: 0 }, [L('tile', 'upgrade', '0.1'), L('tile', 'upgrade', 0.2)] as never);
  expect(r.ok).toBe(true);
  expect(r.lines_subtotal).toBe(0.3);
});

test('no lines against a positive engine total is FAIL with line_count 0', () => {
  const r = compareEngineToLines({ grandSubtotal: 10, windowSubtotal: 0 }, []);
  expect(r).toMatchObject({ ok: false, line_count: 0, lines_subtotal: 0, diff: -10 });
});

test('all 9 fixture units compare ok against the server engine', () => {
  const pricing = enginePricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
  for (const row of liveSubmissions as unknown as SubmissionRow[]) {
    const { server } = engineTotalsForRow(row, pricing);
    const lines = generateQuoteLines(buildGenerateInputFromRow(row, pricing.serverPricing));
    expect(compareEngineToLines(server, lines).ok).toBe(true);
  }
});

test('shared module imports only quoteLines.ts and uses no runtime globals', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/compareEngineToLines.ts'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s.*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  expect(imports.every((i) => i === './quoteLines.ts')).toBe(true);
  expect(src).not.toMatch(/\bDeno\.|\bprocess\.|\bwindow\./);
});
