// Mirror of supabase/functions/_shared/loadServerPricing.test.ts, plus fixture parity through the shared loader.
import { test, expect } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import { loadServerPricing, clientPricingFetcher, restPricingFetcher, type PricingTable } from '../supabase/functions/_shared/loadServerPricing';
import { generateQuoteLines, sumQuoteLines } from '../supabase/functions/_shared/quoteLines';
import { buildGenerateInputFromRow } from './lib/generateInputFromRow';

const raw = {
  pricing_config: [{ config_key: 'markup_percentage', config_value: 60, is_active: true }, { config_key: 'gst_rate', config_value: 5, is_active: true }],
  upgrade_materials: [{ material_key: 'carpet', cost_per_unit: '25', is_active: true }],
  unit_area_data: [{ unit_type_code: 'C', master_bedroom: 44, second_bedroom_carpet: 24 }],
};
const fromObject = (o: Record<string, any[]>) => async (t: PricingTable) => o[t];

test('raw whole-number markup 60 and GST 5 become fractions 0.6 and 0.05', async () => {
  const p = await loadServerPricing(fromObject(raw));
  expect(p.markupPercentage).toBe(0.6);
  expect(p.gstRate).toBe(0.05);
  expect(p.config.markup_percentage).toBe(60);
  expect(p.materials.carpet).toBe(25);
  expect(p.unitAreas.C.masterBedroom).toBe(44);
  expect(p.unitAreas.C.allLvp).toBe(0);
});

test('supabase-js fetcher filters config/materials to active rows (qbo-sync / sync-hubspot query shape)', async () => {
  const calls: string[] = [];
  const admin = { from: (t: string) => ({ select: (c: string) => {
    const q: any = Promise.resolve({ data: (raw as any)[t] });
    q.eq = (k: string, v: unknown) => { calls.push(`${t}:${c}:${k}=${v}`); return Promise.resolve({ data: (raw as any)[t] }); };
    return q;
  } }) };
  const p = await loadServerPricing(clientPricingFetcher(admin));
  expect(p.markupPercentage).toBe(0.6);
  expect(calls.sort()).toEqual(['pricing_config:config_key, config_value, is_percentage:is_active=true', 'upgrade_materials:material_key, cost_per_unit:is_active=true']);
});

test('REST fetcher hits the same endpoints the email/audit functions used, and tolerates non-ok responses', async () => {
  const urls: string[] = [];
  const fakeFetch = (async (u: string) => {
    urls.push(u);
    const t = u.split('/rest/v1/')[1].split('?')[0];
    return t === 'unit_area_data' ? new Response('no', { status: 500 }) : new Response(JSON.stringify((raw as any)[t]));
  }) as unknown as typeof fetch;
  const p = await loadServerPricing(restPricingFetcher('https://x.supabase.co', 'k', fakeFetch));
  expect(urls.sort()).toEqual(['https://x.supabase.co/rest/v1/pricing_config?is_active=eq.true', 'https://x.supabase.co/rest/v1/unit_area_data', 'https://x.supabase.co/rest/v1/upgrade_materials?is_active=eq.true']);
  expect(p.gstRate).toBe(0.05);
  expect(p.unitAreas).toEqual({});
});

// Pinned in scripts/parity.test.ts; the generator fed by loadServerPricing (the edge loader) must reproduce them.
const PINS: Record<string, number> = { '7': 3296.7, '24': 10388.4, '43': 23865 };

for (const unit of Object.keys(PINS)) {
  test(`generator with loadServerPricing reproduces Unit ${unit} parity pin`, async () => {
    const snap = pricingSnapshot as any;
    const pricing = await loadServerPricing(fromObject({
      pricing_config: snap.pricing_config.filter((r: any) => r.is_active),
      upgrade_materials: snap.upgrade_materials.filter((r: any) => r.is_active),
      unit_area_data: snap.unit_area_data,
    }));
    const s = (liveSubmissions as any[]).find(r => r.unit_number === unit);
    const t = sumQuoteLines(generateQuoteLines(buildGenerateInputFromRow(s, pricing)), pricing.gstRate);
    expect(t.subtotal).toBeCloseTo(PINS[unit], 2);
    expect(t.total).toBeCloseTo(PINS[unit] * 1.05, 2);
  });
}
