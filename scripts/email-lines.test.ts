// Phase 2 Task 11 (spec §6.11): the buyer/office emails (send-selections-email) and the resend copies print quote
// lines. Edge-string tests over the pure renderers: seven-column header, sections, `Pending` (never $0.00), totals
// equal to the Phase 1 engine on all nine live units, buyer HTML free of internal text, and the pricing-unavailable
// path printing no money at all.
import { test, expect, describe, spyOn } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, enginePricingFromRows, engineTotalsForRow, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { LINE_COLUMNS, formatMoney } from '../supabase/functions/_shared/lineRenderRows.ts';
import { escapeHtml, QUOTE_TO_FOLLOW_TEXT, renderLinesEmailHtml, type EmailLines } from '../supabase/functions/_shared/linesEmailHtml.ts';
import { serverPricingFromRows } from '../supabase/functions/_shared/loadServerPricing.ts';
import { writeWizardLines } from '../supabase/functions/_shared/wizardSubmissionLines.ts';
import {
  buildAdminEmailHtml, buildPreviewSampleData, generateBuyerConfirmationEmail, generateCSV, renderPreviewAdminHtml, renderPreviewBuyerHtml,
} from '../supabase/functions/send-selections-email/emails.ts';
import { buildAdminHtml, buildBuyerHtml, linesGrandTotal } from '../supabase/functions/resend-confirmation-email/emails.ts';

const pricing = enginePricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const GST = pricing.serverPricing.gstRate;
const SALES = 'SALES-ONLY: buyer is negotiating hard, hold the discount';
const ADMIN = 'ADMIN-ONLY: check deposit cheque';
const INTERNAL = 'INTERNAL-ONLY: supplier backorder risk';

const headerCells = (html: string) => [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
const linesFor = (row: SubmissionRow) => generateQuoteLines(buildGenerateInputFromRow(row, pricing.serverPricing));
const q = (lines: QuoteLine[], pricesAvailable = true): EmailLines => ({ lines, gstRate: GST, pricesAvailable });
const line = (over: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 900, section: 'other', location: 'Kitchen', label: 'Test line', unit: 'flat', pricing_mode: 'manual',
  status: 'upgrade', client_visible: true, source: 'office', provisional: false, amount: 100, ...over,
});

describe('send-selections-email + resend: totals equal the Phase 1 engine on every live unit', () => {
  for (const row of rows) {
    test(`Unit ${row.unit_number}`, () => {
      const { client, server } = engineTotalsForRow(row, pricing);
      const lines = linesFor(row);
      const data = buildPreviewSampleData({ salesComments: SALES, firstName: String(row.first_name ?? 'Buyer') });
      const sub = { ...row, sales_comments: SALES, admin_notes: ADMIN };
      const total = formatMoney(client.grandTotal);
      expect(formatMoney(server.grandTotal)).toBe(total);

      const buyer = generateBuyerConfirmationEmail(data, 'id', q(lines));
      const office = buildAdminEmailHtml(data, 'id', q(lines));
      const resendBuyer = buildBuyerHtml(sub, q(lines));
      const resendAdmin = buildAdminHtml(sub, q(lines), 'Admin');
      for (const html of [buyer, office, resendBuyer, resendAdmin]) {
        // Seven-column header (location · item · product/colour · qty · unit price · amount · status)
        const ths = headerCells(html);
        for (const c of LINE_COLUMNS) expect(ths).toContain(c);
        expect(html).toContain(total);
        expect(html).toContain(formatMoney(client.windowSubtotal));
        expect(html).toContain(formatMoney(client.gst));
      }

      // Buyer copies: never internal notes, sales comments or admin notes.
      const internal = lines.map((l) => (l.internal_note ?? '').trim()).filter((n) => n.length > 0);
      for (const html of [buyer, resendBuyer]) {
        for (const n of internal) expect(html).not.toContain(escapeHtml(n.slice(0, 20)));
        expect(html).not.toContain(SALES);
        expect(html).not.toContain(ADMIN);
        expect(html).not.toContain('Internal notes');
      }
      // Staff copies print the internal notes (after the buyer-safe content).
      for (const html of [office, resendAdmin]) for (const n of internal) expect(html).toContain(escapeHtml(n.slice(0, 20)));
    });
  }
});

describe('rendering rules', () => {
  const base = linesFor(rows[0]);
  const withPending = [...base,
    line({ status: 'pending', amount: null, label: 'Accent wall (awaiting price)', flagged_to: 'dan' }),
    line({ status: 'upgrade', amount: 250, label: 'Hidden office extra', internal_note: INTERNAL, client_note: 'Buyer asked about matching trim' })];

  test('pending lines print "Pending" in a Not included in total section, never $0.00', () => {
    const html = generateBuyerConfirmationEmail(buildPreviewSampleData({}), 'id', q(withPending));
    expect(html).toContain('Not included in total');
    const row = html.split('<tr>').find((r) => r.includes('Accent wall (awaiting price)'))!;
    expect(row).toContain('Pending');
    expect(row).not.toContain('$0.00');
  });

  test('client_note prints for the buyer; internal_note only on the staff copy', () => {
    const buyer = generateBuyerConfirmationEmail(buildPreviewSampleData({}), 'id', q(withPending));
    const staff = buildAdminEmailHtml(buildPreviewSampleData({}), 'id', q(withPending));
    expect(buyer).toContain('Buyer asked about matching trim');
    expect(buyer).not.toContain(INTERNAL);
    expect(staff).toContain(INTERNAL);
  });

  test('a counted line hidden from the buyer: the buyer email prints no prices rather than a smaller total', () => {
    const lines = [...base, line({ amount: 500, client_visible: false, label: 'Secret counted' })];
    const err = spyOn(console, 'error').mockImplementation(() => {});
    const r = renderLinesEmailHtml(lines, { buyerView: true, gstRate: GST, pricesAvailable: true });
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
    expect(r.totals).toBeNull();
    expect(r.html).toContain(QUOTE_TO_FOLLOW_TEXT);
    expect(r.html).not.toMatch(/\$\d/);
    expect(r.html).not.toContain('Secret counted');
  });

  test('resend grandTotal is the buyer copy\'s Total: null when the buyer copy printed no prices', () => {
    const { client } = engineTotalsForRow(rows[0], pricing);
    expect(linesGrandTotal(q(base))!.toFixed(2)).toBe(client.grandTotal.toFixed(2));
    expect(linesGrandTotal(q(base, false))).toBeNull();
    const err = spyOn(console, 'error').mockImplementation(() => {});
    expect(linesGrandTotal(q([...base, line({ amount: 500, client_visible: false })]))).toBeNull();
    err.mockRestore();
  });

  test('the office CSV lists every line once and ends with the five totals', () => {
    const { client } = engineTotalsForRow(rows[0], pricing);
    const csv = generateCSV(buildPreviewSampleData({}), 'id', q(base));
    expect(csv).toContain('--- QUOTE LINES ---');
    expect(csv).toContain(`Section,${LINE_COLUMNS.join(',')}`);
    const totalRow = csv.split('\n').find((l) => l.startsWith('Totals,,Total,'))!;
    expect(totalRow).toContain(`"${formatMoney(client.grandTotal)}"`); // money with a thousands comma is CSV-quoted
  });

  test('no price constants left in the CSV (grout used to print a hard-coded $300)', () => {
    const csv = generateCSV(buildPreviewSampleData({ backsplashGroutEnabled: true }), 'id', q([], false));
    expect(csv).not.toContain('$300');
  });

  test('preview endpoints render from generated lines (no engine)', () => {
    const b = renderPreviewBuyerHtml(buildPreviewSampleData({}));
    const a = renderPreviewAdminHtml(buildPreviewSampleData({}));
    for (const html of [a, b]) {
      expect(headerCells(html)).toEqual(expect.arrayContaining([...LINE_COLUMNS]));
      expect(html).toContain('Total (incl. GST)');
    }
    expect(b).not.toContain('Preview submission — used to verify email legibility.'); // sample salesComments
  });
});

describe('pricing unavailable at submit', () => {
  const empty = serverPricingFromRows({ pricing_config: [], upgrade_materials: [], unit_area_data: [] });
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };

  for (const row of rows.slice(0, 3)) {
    test(`Unit ${row.unit_number}: emails list lines but print no prices and no $0.00`, async () => {
      const r = await writeWizardLines({ savedRow: { ...row, id: 'p' }, rawWindows: null, rawSubtotal: 1, pricing: empty,
        insertRows: async () => ({ error: null }), log: quiet });
      expect(r.status).toBe('skipped');
      expect(r.pricesAvailable).toBe(false);
      const eq: EmailLines = { lines: r.lines, gstRate: 0.05, pricesAvailable: r.pricesAvailable };
      const data = buildPreviewSampleData({});
      const buyer = generateBuyerConfirmationEmail(data, 'p', eq);
      const office = buildAdminEmailHtml(data, 'p', eq);
      const csv = generateCSV(data, 'p', eq);
      for (const out of [buyer, office, csv]) {
        expect(out).not.toContain('$0.00');
        expect(out).not.toMatch(/\$\d/);
      }
      expect(buyer).toContain(QUOTE_TO_FOLLOW_TEXT);
      expect(headerCells(buyer)).not.toContain('Amount');
      expect(headerCells(buyer)).toContain('Location');
    });
  }
});
