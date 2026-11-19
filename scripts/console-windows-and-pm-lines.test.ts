// Task 18 fix round 1: coverage that used to live in itemize-windows.test.ts and canonical-lines.test.ts (both
// engine-based, deleted with the engines).
import { test, expect, describe } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { generatedTotalsForRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { PINNED_SUBTOTALS } from './lib/parityPins';
import { flatRateLine, type LineDraft, type PresetSource } from '../src/lib/addLinePresets';
import { buildPmCanonicalLines } from '../src/lib/submissionLineItems';
import { generateQuoteLines, sumQuoteLines, type GenerateInput, type QuoteLine, type QuotePricing } from '../supabase/functions/_shared/quoteLines';

const snap = pricingSnapshot as unknown as PricingSnapshot;
const pricing = pricingFromRows(snap);
const rows = liveSubmissions as unknown as SubmissionRow[];
const presets: PresetSource = {
  markupPercentage: pricing.markupPercentage,
  materials: [],
  config: snap.pricing_config.map((c) => ({ config_key: c.config_key, config_value: Number(c.config_value), is_active: c.is_active !== false })),
  unitAreas: null,
};
const asLine = (d: LineDraft, i: number): QuoteLine => ({ ...d, sort_order: 10000 + i, client_visible: true, source: 'office', provisional: false } as QuoteLine);

describe('console window presets: quantities → located lines, subtotal unchanged', () => {
  const withWindows = rows.filter((r) => (r.additional_windows_qty || 0) + (r.patio_doors_qty || 0) + (r.automated_windows_qty || 0) > 0);
  test('fixture has units with window quantities', () => { expect(withWindows.length).toBeGreaterThan(0); });
  for (const row of withWindows) {
    test(`Unit ${row.unit_number}`, () => {
      const zeroed = { ...row, additional_windows_qty: 0, patio_doors_qty: 0, automated_windows_qty: 0 } as SubmissionRow;
      const base = generatedTotalsForRow(zeroed, pricing).lines;
      const drafts: LineDraft[] = [];
      const add = (key: string, n: number, label: string) => {
        for (let i = 1; i <= n; i++) {
          const r = flatRateLine(presets, { section: 'window_coverings', configKey: key, location: `${label} ${i}` });
          if ('error' in r) throw new Error(r.error);
          drafts.push(r);
        }
      };
      add('additional_window_price', row.additional_windows_qty || 0, 'Window');
      add('patio_door_price', row.patio_doors_qty || 0, 'Patio Door');
      add('automated_motor_price', row.automated_windows_qty || 0, 'Motorized');
      const located = [...base, ...drafts.map(asLine)];
      const t = sumQuoteLines(located, pricing.gstRate);
      expect(t.subtotal.toFixed(2)).toBe(PINNED_SUBTOTALS[String(row.unit_number)].toFixed(2));
      expect(t.windowCoverings.toFixed(2)).toBe(generatedTotalsForRow(row, pricing).totals.windowCoverings.toFixed(2));
      expect(drafts.every((d) => d.section === 'window_coverings' && d.location && d.amount === d.unit_price)).toBe(true);
    });
  }
});

describe('PM canonical lines include the bedroom premium carpet / underpad', () => {
  const small: QuotePricing = {
    materials: { carpet: 25, premium_carpet_underpad: 6 }, config: {},
    unitAreas: { C: { masterBedroom: 44, secondBedroomCarpet: 24 } }, markupPercentage: 0.6, gstRate: 0.05,
  };
  const gen = (sel: Partial<GenerateInput['selections']>) => generateQuoteLines({
    selections: { areaUpgrades: [], bedroomFlooringChoice: 'carpet', ...sel } as GenerateInput['selections'], unitTypeCode: 'C', pricing: small, baseSpec: [],
  });
  test('underpad on a Primary Bedroom (hard second bedroom): 44 sq yd, $422.40; canonical sums to the subtotal', () => {
    const lines = gen({ premiumUnderpadBedroom: true, areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp' } as never] });
    const pm = buildPmCanonicalLines(lines);
    const u = pm.find((l) => /Premium underpad/.test(l.line_label))!;
    expect(u).toMatchObject({ location: 'Primary Bedroom', unit_of_measure: 'sqyd', quantity: 44 });
    expect(u.amount).toBeCloseTo(422.4, 2);
    expect(pm.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(sumQuoteLines(lines, 0.05).subtotal, 6);
  });
  test('premium carpet on both bedrooms: $2,720', () => {
    const pm = buildPmCanonicalLines(gen({ premiumCarpetBedroom: true }));
    expect(pm.find((l) => /Premium carpet/.test(l.line_label))?.amount).toBeCloseTo(2720, 2);
  });
});
