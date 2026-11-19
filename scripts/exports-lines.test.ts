// Phase 2 Task 11 (spec §6.11): the CSV/section export, the flat sheet, the project-management hub and the HubSpot
// window value read quote lines. Before = the Phase 1 engine's numbers; after = sumQuoteLines over the lines; they
// must agree to the cent on all nine live units.
import { test, expect, describe } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, enginePricingFromRows, engineTotalsForRow, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines, countsInTotal, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { formatMoney } from '../supabase/functions/_shared/lineRenderRows.ts';
import { buildSubmissionSectionRows, EXPORT_SECTIONS, type BuyerSelection } from '../src/lib/submissionExportBuilder';
import { buildFlatExport } from '../src/lib/submissionFlatExport';
import { buildPmCanonicalLines, legacyLineKey } from '../src/lib/submissionLineItems';
import { derivePMData } from '../src/lib/projectManagementData';
import { hubspotPricingProperties, hubspotQuoteValues, HUBSPOT_PRICING_PROPERTIES } from '../supabase/functions/sync-hubspot/quoteValues.ts';
import { pricingUnavailableReason, serverPricingFromRows } from '../supabase/functions/_shared/loadServerPricing.ts';

const pricing = enginePricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const GST = pricing.serverPricing.gstRate;
const cents = (n: number) => Math.round(n * 100);
// Stored lines have ids; give the generated fixture lines stable ones.
const linesFor = (row: SubmissionRow): QuoteLine[] =>
  generateQuoteLines(buildGenerateInputFromRow(row, pricing.serverPricing)).map((l, i) => ({ ...l, id: `${row.id}-q${i}` }));
const sel = (row: SubmissionRow) => row as unknown as BuyerSelection;

describe('section export (CSV / XLSX sheets)', () => {
  for (const row of rows) {
    test(`Unit ${row.unit_number}: one quote_lines row per counted line, summing to the engine subtotal; totals equal`, () => {
      const { client, server } = engineTotalsForRow(row, pricing);
      const lines = linesFor(row);
      const out = buildSubmissionSectionRows(sel(row), lines, GST);
      const ql = out.quote_lines;
      expect(ql.length).toBe(lines.filter(countsInTotal).length);
      expect(ql.reduce((t, r) => t + cents(Number(r.amount)), 0)).toBe(cents(client.grandSubtotal));
      expect(cents(server.grandSubtotal)).toBe(cents(client.grandSubtotal));
      for (const r of ql) {
        for (const k of ['quote_line_id', 'section', 'location', 'label', 'quantity', 'unit_price', 'amount', 'status']) expect(r).toHaveProperty(k);
      }
      const np = out.notes_pricing[0];
      expect(np.window_subtotal).toBe(Math.round(client.windowSubtotal * 100) / 100);
      expect(np.upgrades_subtotal).toBe(Math.round(client.upgradesSubtotal * 100) / 100);
      expect(np.grand_subtotal).toBe(Math.round(client.grandSubtotal * 100) / 100);
      expect(np.gst).toBe(Math.round(client.gst * 100) / 100);
      expect(np.grand_total).toBe(Math.round(client.grandTotal * 100) / 100);
      expect(out.window_coverings[0].window_subtotal).toBe(Math.round(client.windowSubtotal * 100) / 100);
    });
  }

  test('every section row matches its declared columns; non-pricing columns kept, per-column charges gone', () => {
    const out = buildSubmissionSectionRows(sel(rows[0]), linesFor(rows[0]), GST);
    for (const s of EXPORT_SECTIONS) {
      for (const r of out[s.id] ?? []) expect(Object.keys(r).sort()).toEqual([...s.columns].sort());
    }
    const all = EXPORT_SECTIONS.flatMap((s) => s.columns);
    for (const kept of ['lvp_colour', 'spc_tile_colour', 'backsplash_grout_color', 'stair_carpet_colour', 'additional_windows_qty', 'area_name', 'client_comment', 'admin_notes']) {
      expect(all).toContain(kept);
    }
    for (const gone of ['bathroom_tile_charge', 'heated_floor_charge', 'custom_shower_charge', 'backsplash_grout_charge', 'stair_lvp_charge', 'stair_carpet_charge', 'additional_window_charge', 'patio_door_charge', 'window_automation_charge']) {
      expect(all).not.toContain(gone);
    }
  });
});

describe('flat export', () => {
  test('totals columns equal the engine on all nine units; line columns sum to the subtotal', () => {
    const targets = rows.map(sel);
    const linesBySubmission = Object.fromEntries(rows.map((r) => [r.id, linesFor(r)]));
    const flat = buildFlatExport(targets, linesBySubmission, GST);
    const col = (label: string) => flat.columns.findIndex((c) => c.label === label);
    const amountCols = flat.columns.map((c, i) => ({ c, i })).filter(({ c }) => /^Line #\d+ Amount \$$/.test(c.label)).map(({ i }) => i);
    expect(amountCols.length).toBe(Math.max(...rows.map((r) => linesFor(r).filter(countsInTotal).length)));
    rows.forEach((row, k) => {
      const { client } = engineTotalsForRow(row, pricing);
      const r = flat.rows[k];
      expect(r[col('Grand Total $')]).toBe(Math.round(client.grandTotal * 100) / 100);
      expect(r[col('Grand Subtotal $')]).toBe(Math.round(client.grandSubtotal * 100) / 100);
      expect(r[col('Window Subtotal $')]).toBe(Math.round(client.windowSubtotal * 100) / 100);
      expect(r[col('GST $')]).toBe(Math.round(client.gst * 100) / 100);
      const lineSum = amountCols.reduce((t, i) => t + cents(Number(r[i] || 0)), 0);
      expect(lineSum).toBe(cents(client.grandSubtotal));
    });
    for (const gone of ['Bathroom Tile $', 'Grout $', 'Stair LVP $', 'Additional Window $', '#1 Amount $']) expect(col(gone)).toBe(-1);
    for (const kept of ['LVP Colour', 'Grout Color', 'Additional Windows Qty', '#1 Area', 'Admin Notes']) expect(col(kept)).toBeGreaterThan(-1);
  });
});

describe('project-management hub', () => {
  test('canonical PM lines carry quote_line_id and cover every counted + included line', () => {
    for (const row of rows) {
      const lines = linesFor(row);
      const pm = buildPmCanonicalLines(lines);
      const expected = lines.filter((l) => countsInTotal(l) || l.status === 'included');
      expect(pm.map((p) => p.quote_line_id)).toEqual(expected.map((l) => l.id!));
      expect(pm.every((p) => p.line_key === p.quote_line_id)).toBe(true);
      for (const [p, l] of pm.map((p, i) => [p, expected[i]] as const)) {
        expect(p.material_key).toBe(l.material_key ?? null);
        expect(p.area_type).toBe(l.section);
        expect(p.unit_of_measure).toBe(l.unit);
        expect(p.quantity).toBe(l.quantity ?? 1);
      }
    }
  });

  test('unit grand totals equal the engine; tracking joins by quote_line_id, legacy keys still attach', () => {
    const submissions = rows.map((r) => ({ ...r }));
    const linesBySubmission = Object.fromEntries(rows.map((r) => [r.id, linesFor(r)]));
    const unit = rows.find((r) => linesFor(r).some((l) => l.wizard_field === 'backsplash_grout_enabled' && countsInTotal(l)))
      ?? rows.find((r) => linesFor(r).some((l) => l.section === 'window_coverings' && countsInTotal(l)))!;
    const target = linesFor(unit).find((l) => countsInTotal(l))!;
    const legacy = linesFor(unit).find((l) => countsInTotal(l) && legacyLineKey(l) && l.id !== target.id);
    const tracked = [
      { submission_id: unit.id, line_key: target.id!, supplier: 'Supplier A', installation_status: 'ordered' },
      ...(legacy ? [{ submission_id: unit.id, line_key: legacyLineKey(legacy)!, supplier: 'Legacy Co', installation_status: 'received' }] : []),
    ];
    const pm = derivePMData({ submissions, linesBySubmission, gstRate: GST, payments: [], lineItems: tracked as never[], suppliers: [] });
    for (const row of rows) {
      const { client } = engineTotalsForRow(row, pricing);
      expect(pm.units.find((u) => u.submission_id === row.id)!.grand_total.toFixed(2)).toBe(client.grandTotal.toFixed(2));
    }
    const pmLine = pm.lines.find((l) => l.line_key === target.id)!;
    expect(pmLine.supplier).toBe('Supplier A');
    expect(pmLine.installation_status).toBe('ordered');
    if (legacy) expect(pm.lines.find((l) => l.line_key === legacy.id)!.supplier).toBe('Legacy Co');
  });

  test('a legacy key attaches to the first matching line only (no double-counted quantities)', () => {
    // Unit 24 has two patio-door lines that both map to the legacy `window_patio` key.
    const row = rows.find((r) => linesFor(r).filter((l) => legacyLineKey(l) === 'window_patio').length > 1)!;
    expect(row).toBeDefined();
    const lines = linesFor(row);
    const pm = derivePMData({
      submissions: [{ ...row }], linesBySubmission: { [row.id]: lines }, gstRate: GST, payments: [], suppliers: [],
      lineItems: [{ submission_id: row.id, line_key: 'window_patio', quantity_ordered: 3 }] as never[],
    });
    expect(pm.lines.filter((l) => l.quantity_ordered === 3).length).toBe(1);
    expect(pm.aggregates.reduce((t, a) => t + a.ordered_qty, 0)).toBe(3);
  });
});

describe('HubSpot', () => {
  for (const row of rows) {
    test(`Unit ${row.unit_number}: bmd_window_total = engine windowSubtotal; subtotal/GST/total equal`, () => {
      const { client, server } = engineTotalsForRow(row, pricing);
      const v = hubspotQuoteValues(linesFor(row), GST);
      expect(v.windowTotal.toFixed(2)).toBe(server.windowSubtotal.toFixed(2));
      expect(v.windowTotal.toFixed(2)).toBe(client.windowSubtotal.toFixed(2));
      expect(v.subtotal.toFixed(2)).toBe(client.grandSubtotal.toFixed(2));
      expect(v.gst.toFixed(2)).toBe(client.gst.toFixed(2));
      expect(v.grandTotal.toFixed(2)).toBe(client.grandTotal.toFixed(2));
    });
  }
});

describe('HubSpot: pricing unavailable never overwrites CRM values', () => {
  const empty = serverPricingFromRows({ pricing_config: [], upgrade_materials: [], unit_area_data: [] });
  const reason = pricingUnavailableReason(empty);
  test('generated lines + pricing unavailable: pricing properties omitted (no $0.00 pushed)', () => {
    expect(reason).not.toBeNull();
    const generated = generateQuoteLines(buildGenerateInputFromRow(rows[0], empty));
    expect(hubspotPricingProperties(generated, 0.05, { linesSource: 'generated', pricingUnavailable: reason })).toBeNull();
  });
  test('stored lines are sent even when the pricing tables failed (they carry their own prices)', () => {
    const { client } = engineTotalsForRow(rows[0], pricing);
    const p = hubspotPricingProperties(linesFor(rows[0]), GST, { linesSource: 'db', pricingUnavailable: reason })!;
    expect(Object.keys(p).sort()).toEqual([...HUBSPOT_PRICING_PROPERTIES].sort());
    // Same rounding as the PDF/emails (formatMoney), not toFixed (which rounds binary halves down).
    const doc = (n: number) => formatMoney(n).replace(/[$,]/g, '');
    expect(p.bmd_upgrade_grand_total).toBe(doc(client.grandTotal));
    expect(p.bmd_window_total).toBe(doc(client.windowSubtotal));
  });
  test('CRM money text rounds like the documents (707.175 → 707.18, not toFixed\'s 707.17)', () => {
    const one: QuoteLine = { id: 'w', sort_order: 1, section: 'window_coverings', location: 'Living', label: 'Window', unit: 'each',
      quantity: 1, unit_price: 673.5, amount: 673.5, pricing_mode: 'flat_rate', status: 'upgrade', client_visible: true, source: 'wizard', provisional: false };
    const p = hubspotPricingProperties([one], 0.05, { linesSource: 'db', pricingUnavailable: null })!;
    expect(p.bmd_upgrade_grand_total).toBe('707.18');
    expect(p.bmd_upgrade_breakdown).toContain('$707.18');
  });
  test('generated lines with pricing loaded are sent', () => {
    expect(hubspotPricingProperties(linesFor(rows[0]), GST, { linesSource: 'generated', pricingUnavailable: null })).not.toBeNull();
  });
});
