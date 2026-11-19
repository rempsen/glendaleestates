// Deno tests: `deno test supabase/functions/`. No-op under bun (mirror: scripts/exports-lines.test.ts "HubSpot").
import { hubspotPricingProperties } from './quoteValues.ts';
import type { QuoteLine } from '../_shared/quoteLines.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

if (denoTest) {
  const lines: QuoteLine[] = [{ id: 'w', sort_order: 1, section: 'window_coverings', location: 'Living', label: 'Window', unit: 'each',
    quantity: 1, unit_price: 673.5, amount: 673.5, pricing_mode: 'flat_rate', status: 'upgrade', client_visible: true, source: 'wizard', provisional: false }];
  denoTest('generated lines with pricing unavailable: pricing properties omitted', () => {
    ok(hubspotPricingProperties(lines, 0.05, { linesSource: 'generated', pricingUnavailable: 'empty pricing_config' }) === null, 'expected null');
  });
  denoTest('stored lines: bmd_window_total = windowCoverings', () => {
    const p = hubspotPricingProperties(lines, 0.05, { linesSource: 'db', pricingUnavailable: 'empty pricing_config' });
    ok(p?.bmd_window_total === '673.50' && p.bmd_upgrade_grand_total === '707.18', JSON.stringify(p));
  });
}
