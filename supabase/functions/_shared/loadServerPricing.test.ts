// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/load-server-pricing.test.ts).
import { loadServerPricing, type PricingTable } from './loadServerPricing.ts';

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
}
