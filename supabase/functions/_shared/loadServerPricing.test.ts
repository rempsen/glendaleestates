// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/load-server-pricing.test.ts).
import { loadServerPricing, restPricingFetcher, type PricingTable } from './loadServerPricing.ts';
import { parseSelectionBody, MAX_PDF_BASE64_CHARS } from './submissionRow.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const rows: Record<PricingTable, unknown[]> = {
    pricing_config: [{ config_key: 'markup_percentage', config_value: 60 }, { config_key: 'gst_rate', config_value: 5 }],
    upgrade_materials: [{ material_key: 'carpet', cost_per_unit: '25' }],
    unit_area_data: [],
  };
  denoTest('markup 60 / GST 5 become 0.6 / 0.05', async () => {
    const p = await loadServerPricing(async t => rows[t]);
    eq([p.markupPercentage, p.gstRate, p.materials.carpet], [0.6, 0.05, 25]);
  });
  denoTest('missing tables fall back to 0.6 / 0.05 and empty maps', async () => {
    const p = await loadServerPricing(async () => null);
    eq(p, { materials: {}, config: {}, unitAreas: {}, markupPercentage: 0.6, gstRate: 0.05 });
  });
  denoTest('is_active: REST fetcher filters both priced tables and inactive rows never price', async () => {
    const urls: string[] = [];
    const all: Record<string, unknown[]> = {
      pricing_config: [{ config_key: 'patio_door_price', config_value: 2347.8, is_active: true }, { config_key: 'additional_window_price', config_value: 999, is_active: false }],
      upgrade_materials: [{ material_key: 'carpet', cost_per_unit: 25, is_active: true }, { material_key: 'hardwood', cost_per_unit: 77, is_active: false }],
      unit_area_data: [],
    };
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify(all[u.split('/rest/v1/')[1].split('?')[0]])); }) as unknown as typeof fetch;
    const p = await loadServerPricing(restPricingFetcher('https://x', 'k', f));
    eq(urls.filter((u) => u.includes('is_active=eq.true')).length, 2);
    eq([p.config.additional_window_price, p.materials.hardwood, p.config.patio_door_price, p.materials.carpet], [undefined, undefined, 2347.8, 25]);
  });
  denoTest('pdfBase64 is parsed (HubSpot gets the PDF); over 8 MB is dropped, not refused', () => {
    eq(parseSelectionBody({ unitNumber: '1', pdfBase64: 'JVBERi0=' }).pdfBase64, 'JVBERi0=');
    const warn = console.warn; console.warn = () => {};
    try { eq(parseSelectionBody({ unitNumber: '1', pdfBase64: 'A'.repeat(MAX_PDF_BASE64_CHARS + 1) }).pdfBase64, null); } finally { console.warn = warn; }
  });
}
