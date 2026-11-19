// Deno tests: `deno test supabase/functions/`. No-op under bun (mirror: scripts/wizard-lines.test.ts, "submit path").
import { writeWizardLines } from './wizardSubmissionLines.ts';
import { serverPricingFromRows } from './loadServerPricing.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

if (denoTest) {
  const row = { id: 'sub-d', unit_type: 'Corner Unit C', additional_windows_qty: 1, patio_doors_qty: 0, automated_windows_qty: 0 };
  const silent = () => { const msgs: string[] = []; const f = (m: string) => { msgs.push(m); }; return { msgs, log: { info: f, warn: f, error: f } }; };

  denoTest('empty pricing (failed fetch): no insert attempted, resolves skipped, logs "lines skipped: pricing unavailable"', async () => {
    let calls = 0;
    const { msgs, log } = silent();
    const r = await writeWizardLines({
      savedRow: row, rawWindows: [{ location: 'Kitchen', kind: 'roller_5', motorized: false }], rawSubtotal: 673.5,
      pricing: serverPricingFromRows({ pricing_config: [], upgrade_materials: [], unit_area_data: [] }),
      insertRows: async () => { calls++; return { error: null }; }, log,
    });
    ok(r.status === 'skipped', `status ${r.status}`);
    ok(calls === 0, 'insert must not be attempted');
    ok(msgs.some((m) => m.includes('lines skipped: pricing unavailable') && m.includes('sub-d')), msgs.join('|'));
  });

  denoTest('complete pricing: one batch insert of wizard lines; insert throw resolves failed', async () => {
    const pricing = serverPricingFromRows({
      pricing_config: [{ config_key: 'additional_window_price', config_value: 673.5 }, { config_key: 'gst_rate', config_value: 5 }],
      upgrade_materials: [{ material_key: 'lvp', cost_per_unit: 5 }],
      unit_area_data: [{ unit_type_code: 'C', main_living: 500 }],
    });
    const batches: Array<Array<{ source: string; submission_id: string }>> = [];
    const r = await writeWizardLines({
      savedRow: row, rawWindows: [{ location: 'Kitchen', kind: 'roller_5', motorized: false }], rawSubtotal: 673.5, pricing,
      insertRows: async (rows) => { batches.push(rows); return { error: null }; }, log: silent().log,
    });
    ok(r.status === 'written' && batches.length === 1, JSON.stringify(r));
    ok(batches[0].every((l) => l.source === 'wizard' && l.submission_id === 'sub-d'), 'insert rows');
    const t = await writeWizardLines({ savedRow: row, rawWindows: null, rawSubtotal: 0, pricing,
      insertRows: async () => { throw new Error('network'); }, log: silent().log });
    ok(t.status === 'failed', 'throw is reported, not thrown');
  });
}
