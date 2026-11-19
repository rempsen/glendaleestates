// Bun mirror of supabase/functions/_shared/compareStoredToGenerated.test.ts, plus the audit handler over the 9 fixture
// units: stored = generated reports 0 drift everywhere; a console edit to one stored line is reported as drift.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { compareStoredToGenerated } from '../supabase/functions/_shared/compareStoredToGenerated.ts';
import { savedSubmissionLinesCore } from '../supabase/functions/_shared/savedSubmissionLines.ts';
import { auditStoredVsGenerated } from '../supabase/functions/audit-pricing-consistency/handler.ts';

const L = (section: string, status: string, amount: number | string | null) => ({ section, status, amount }) as never;

test('equal lines → ok, counts counted / not-in-total / included (stored side)', () => {
  const lines = [
    L('flooring', 'upgrade', 100), L('window_coverings', 'upgrade', 50), L('standard', 'included', 0),
    L('other', 'deferred', 999), L('other', 'pending', null), L('other', 'removed', 5000),
  ];
  expect(compareStoredToGenerated(lines, lines)).toEqual({
    generated_subtotal: 150, stored_subtotal: 150, diff: 0, windows_generated: 50, windows_stored: 50,
    windows_diff: 0, line_count: 6, counted_lines: 2, not_in_total: 2, ok: true,
  });
});

test('a one-cent drift is not ok; diff is stored − generated', () => {
  const r = compareStoredToGenerated([L('flooring', 'upgrade', 100.01)], [L('flooring', 'upgrade', 100)]);
  expect(r.ok).toBe(false);
  expect(r.diff).toBe(0.01);
});

test('a line moved out of window coverings alone is not ok', () => {
  const r = compareStoredToGenerated([L('other', 'upgrade', 40)], [L('window_coverings', 'upgrade', 40)]);
  expect([r.ok, r.diff, r.windows_diff]).toEqual([false, 0, -40]);
});

test('numeric strings from PostgREST are summed as numbers; float noise below half a cent is ok', () => {
  const r = compareStoredToGenerated([L('tile', 'upgrade', '0.1'), L('tile', 'upgrade', 0.2)], [L('tile', 'upgrade', 0.3)]);
  expect(r.ok).toBe(true);
  expect(r.stored_subtotal).toBe(0.3);
});

test('no stored lines against a positive generated total is not ok, line_count 0', () => {
  expect(compareStoredToGenerated([], [L('tile', 'upgrade', 10)])).toMatchObject({ ok: false, line_count: 0, stored_subtotal: 0, diff: -10 });
});

const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as Array<SubmissionRow & { id: string; unit_number: string }>;
const backfilled = new Map(rows.map((r) => [r.id, savedSubmissionLinesCore([], r as never, pricing).lines]));

test('audit handler: freshly backfilled lines show 0 drift on all 9 units', async () => {
  const report = await auditStoredVsGenerated(null, {
    listSubmissions: async () => rows as never,
    storedLines: async (id) => backfilled.get(id) as never,
    loadPricing: async () => pricing,
  });
  expect(report.audited).toBe(9);
  expect(report.okCount).toBe(9);
  expect(report.driftCount + report.errorCount).toBe(0);
  // Unit 27 has no counted line but still stores its included lines.
  expect(report.rows.every((r) => r.diff === 0 && r.windows_diff === 0 && r.line_count > 0)).toBe(true);
});

test('audit handler: a console edit on one unit is drift; no stored lines is "no lines"', async () => {
  const u24 = rows.find((r) => r.unit_number === '24')!;
  const u2 = rows.find((r) => r.unit_number === '2')!;
  const report = await auditStoredVsGenerated(null, {
    listSubmissions: async () => [u24, u2] as never,
    storedLines: async (id) => {
      if (id === u2.id) return [];
      return backfilled.get(id)!.map((l, i) => (i === backfilled.get(id)!.findIndex((x) => x.status === 'upgrade') ? { ...l, amount: (l.amount ?? 0) + 1 } : l)) as never;
    },
    loadPricing: async () => pricing,
  });
  expect(report.rows.map((r) => [r.unit_number, r.status, r.diff])).toEqual([['24', 'drift', 1], ['2', 'no lines', -2460]]);
});

test('shared module imports only quoteLines.ts and uses no runtime globals', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/compareStoredToGenerated.ts'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s.*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  expect(imports).toEqual(['./quoteLines.ts']);
  expect(src).not.toMatch(/\bDeno\.|\bprocess\.|\bwindow\./);
});

test('audit-pricing-consistency has no engine mode and no mode parameter', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/audit-pricing-consistency/index.ts'), 'utf8')
    + readFileSync(join(import.meta.dir, '../supabase/functions/audit-pricing-consistency/handler.ts'), 'utf8');
  expect(src).not.toMatch(/computeUpgradeTotals|upgradeTotalsServer|body\.mode|mode:/);
});
