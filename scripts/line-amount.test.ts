// Phase 2 Task 8: the console's single allowed arithmetic — amount = qty × unit price when both are present.
import { test, expect, describe } from 'bun:test';
import { lineAmount } from '../src/lib/lineAmount';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines } from '../supabase/functions/_shared/quoteLines.ts';

describe('lineAmount', () => {
  test('qty × unit price when both present', () => {
    expect(lineAmount(2, 637.5, null)).toBe(1275);
    expect(lineAmount(44, 9.6, 999)).toBe(422.4); // computed wins over a stale typed amount
  });
  test('float noise is normalised, then rounded to cents half-up (I4: QBO stores cents)', () => {
    expect(lineAmount(44, 6 * 1.6, null)).toBe(422.4);
    expect(lineAmount(3, 0.1, null)).toBe(0.3);
    expect(lineAmount(1, 1.005, null)).toBe(1.01);
    expect(lineAmount(3, 3.333, null)).toBe(10);
    expect(lineAmount(7, 1.234, null)).toBe(8.64);
    expect(lineAmount(null, null, 12.345)).toBe(12.35);
  });
  test('the generator yields no sub-cent amount on the nine live units (cent rounding cannot move a pin)', () => {
    const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
    const subCent = (liveSubmissions as unknown as SubmissionRow[])
      .flatMap((r) => generateQuoteLines(buildGenerateInputFromRow(r, pricing)))
      .filter((l) => l.amount != null && Math.abs(Math.round(l.amount * 100) - l.amount * 100) > 1e-6);
    expect(subCent).toEqual([]);
  });
  test('falls back to the typed amount when qty or unit price is missing', () => {
    expect(lineAmount(null, 637.5, 1005)).toBe(1005);
    expect(lineAmount(2, null, 1005)).toBe(1005);
    expect(lineAmount(undefined, undefined, 12.5)).toBe(12.5);
  });
  test('nothing known → null (Pending, never $0)', () => {
    expect(lineAmount(null, null, null)).toBeNull();
    expect(lineAmount(2, null, undefined)).toBeNull();
  });
  test('non-finite inputs are treated as missing', () => {
    expect(lineAmount(Number.NaN, 5, 7)).toBe(7);
    expect(lineAmount(2, Number.POSITIVE_INFINITY, null)).toBeNull();
    expect(lineAmount(2, 5, Number.NaN)).toBe(10);
    expect(lineAmount(null, 5, Number.NaN)).toBeNull();
  });
  test('zero is a value, not missing', () => {
    expect(lineAmount(0, 5, 99)).toBe(0);
    expect(lineAmount(null, null, 0)).toBe(0);
  });
});
