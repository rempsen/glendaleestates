// Task 8 fix round 1 (controller ruling): generator and console share one price_source_ref convention.
import { test, expect } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, enginePricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines } from '../supabase/functions/_shared/quoteLines.ts';

const PREFIXED = /^(material|config|override|manual|custom):[\w.[\]-]+$/;
const { serverPricing } = enginePricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const all = rows.flatMap((r) => generateQuoteLines(buildGenerateInputFromRow(r, serverPricing)));

test('every generated price_source_ref on the 9 live units is prefixed', () => {
  const refs = all.map((l) => l.price_source_ref).filter((r): r is string => !!r);
  expect(refs.length).toBeGreaterThan(20);
  expect(refs.filter((r) => !PREFIXED.test(r))).toEqual([]);
});

test('catalog lines reference material:<material_key>, flat-rate lines config:<key>', () => {
  for (const l of all) {
    if (l.pricing_mode === 'catalog') expect(l.price_source_ref).toMatch(/^material:/);
    if (l.pricing_mode === 'flat_rate') expect(l.price_source_ref).toMatch(/^config:/);
  }
  expect(all.some((l) => l.pricing_mode === 'catalog')).toBe(true);
  expect(all.some((l) => l.pricing_mode === 'flat_rate')).toBe(true);
});
