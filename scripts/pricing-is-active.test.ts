// Ledgered defect (Task 11): every pricing loader honours `is_active` on pricing_config and upgrade_materials.
// Before: restPricingFetcher priced inactive pricing_config rows and quotePricingFromRows ignored is_active entirely.
import { test, expect } from 'bun:test';
import {
  clientPricingFetcher, loadServerPricing, restPricingFetcher, serverPricingFromRows, type PricingTable,
} from '../supabase/functions/_shared/loadServerPricing';
import { quotePricingFromRows } from '../src/lib/generateInputFromSelections';

const rows = {
  pricing_config: [
    { config_key: 'markup_percentage', config_value: 60, is_active: true },
    { config_key: 'gst_rate', config_value: 5, is_active: true },
    { config_key: 'patio_door_price', config_value: 2347.8, is_active: true },
    // Retired price: must never price a line.
    { config_key: 'additional_window_price', config_value: 999, is_active: false },
  ],
  upgrade_materials: [
    { material_key: 'carpet', cost_per_unit: 25, is_active: true },
    { material_key: 'hardwood', cost_per_unit: 77, is_active: false },
  ],
  unit_area_data: [{ unit_type_code: 'C', master_bedroom: 44 }],
};

// A PostgREST double that applies `?is_active=eq.true` the way the server would.
const restDouble = (urls: string[]) => (async (u: string) => {
  urls.push(u);
  const [path, query = ''] = u.split('/rest/v1/')[1].split('?');
  let data = (rows as Record<string, Array<Record<string, unknown>>>)[path];
  if (query.includes('is_active=eq.true')) data = data.filter((r) => r.is_active === true);
  return new Response(JSON.stringify(data));
}) as unknown as typeof fetch;

// A supabase-js double whose .eq() filters.
const clientDouble = {
  from: (t: string) => ({
    select: () => {
      const all = (rows as Record<string, Array<Record<string, unknown>>>)[t];
      const q = Promise.resolve({ data: all }) as Promise<{ data: unknown[] }> & { eq: (k: string, v: unknown) => Promise<{ data: unknown[] }> };
      q.eq = (k, v) => Promise.resolve({ data: all.filter((r) => r[k] === v) });
      return q;
    },
  }),
};

const expectInactiveSkipped = (p: { config: Record<string, number>; materials: Record<string, number> }) => {
  expect(p.config.additional_window_price).toBeUndefined();
  expect(p.config.patio_door_price).toBe(2347.8);
  expect(p.materials.hardwood).toBeUndefined();
  expect(p.materials.carpet).toBe(25);
};

test('REST fetcher filters pricing_config and upgrade_materials to is_active = true', async () => {
  const urls: string[] = [];
  const p = await loadServerPricing(restPricingFetcher('https://x.supabase.co', 'k', restDouble(urls)));
  expect(urls.sort()).toEqual([
    'https://x.supabase.co/rest/v1/pricing_config?is_active=eq.true',
    'https://x.supabase.co/rest/v1/unit_area_data',
    'https://x.supabase.co/rest/v1/upgrade_materials?is_active=eq.true',
  ]);
  expectInactiveSkipped(p);
});

test('supabase-js fetcher skips the inactive rows', async () => {
  expectInactiveSkipped(await loadServerPricing(clientPricingFetcher(clientDouble)));
});

test('serverPricingFromRows / quotePricingFromRows skip is_active = false rows even when a caller fetched them', () => {
  expectInactiveSkipped(serverPricingFromRows(rows));
  expectInactiveSkipped(quotePricingFromRows({ config: rows.pricing_config, materials: rows.upgrade_materials, unitAreas: rows.unit_area_data }));
  // Rows without the column (narrow selects) still count.
  const narrow = serverPricingFromRows({ pricing_config: [{ config_key: 'gst_rate', config_value: 5 }], upgrade_materials: [{ material_key: 'lvp', cost_per_unit: 4.5 }] });
  expect(narrow.gstRate).toBe(0.05);
  expect(narrow.materials.lvp).toBe(4.5);
});
