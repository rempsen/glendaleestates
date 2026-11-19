// Deno edge-string tests for the submit emails (Phase 2 Task 11). Run: deno test supabase/functions/
// No-ops under bun; the bun mirror over all nine live units is scripts/email-lines.test.ts.
import {
  buildAdminEmailHtml, buildPreviewSampleData, generateBuyerConfirmationEmail, generateCSV, previewEmailLines,
} from './emails.ts';
import { LINE_COLUMNS } from '../_shared/lineRenderRows.ts';
import { QUOTE_TO_FOLLOW_TEXT } from '../_shared/linesEmailHtml.ts';
import { serverPricingFromRows } from '../_shared/loadServerPricing.ts';
import { writeWizardLines } from '../_shared/wizardSubmissionLines.ts';
import { buyerSelectionsInsertRow } from '../_shared/submissionRow.ts';
import type { QuoteLine } from '../_shared/quoteLines.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const ths = (html: string) => [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);

if (denoTest) {
  const SALES = 'SALES-ONLY hold the discount';
  const INTERNAL = 'INTERNAL-ONLY supplier backorder';
  const data = buildPreviewSampleData({ salesComments: SALES });
  const base = previewEmailLines(data);
  const extra: QuoteLine[] = [
    { sort_order: 900, section: 'other', location: 'Kitchen', label: 'Accent wall', unit: 'flat', pricing_mode: 'manual',
      status: 'pending', amount: null, client_visible: true, source: 'office', provisional: false },
    { sort_order: 901, section: 'other', location: 'Kitchen', label: 'Trim', unit: 'flat', pricing_mode: 'manual',
      status: 'upgrade', amount: 120, client_visible: true, source: 'office', provisional: false, internal_note: INTERNAL },
  ];
  const q = { ...base, lines: [...base.lines, ...extra] };

  denoTest('buyer + office emails carry the seven-column header', () => {
    for (const html of [generateBuyerConfirmationEmail(data, 'id', q), buildAdminEmailHtml(data, 'id', q)]) {
      for (const c of LINE_COLUMNS) ok(ths(html).includes(c), `missing column ${c}`);
    }
  });

  denoTest('pending line prints Pending, never $0.00', () => {
    const html = generateBuyerConfirmationEmail(data, 'id', q);
    const row = html.split('<tr>').find((r) => r.includes('Accent wall'))!;
    ok(row.includes('Pending') && !row.includes('$0.00'), row);
  });

  denoTest('buyer HTML never carries internal_note or sales_comments; office HTML does', () => {
    const buyer = generateBuyerConfirmationEmail(data, 'id', q);
    const office = buildAdminEmailHtml(data, 'id', q);
    ok(!buyer.includes(INTERNAL) && !buyer.includes(SALES), 'buyer leaked internal text');
    ok(office.includes(INTERNAL) && office.includes(SALES), 'office lost internal text');
  });

  denoTest('pricing unavailable: lines listed, no money, no $0.00, quote to follow', async () => {
    const empty = serverPricingFromRows({ pricing_config: [], upgrade_materials: [], unit_area_data: [] });
    const quiet = { info: () => {}, warn: () => {}, error: () => {} };
    const r = await writeWizardLines({ savedRow: { ...buyerSelectionsInsertRow(data), id: 'p' }, rawWindows: null, rawSubtotal: 1,
      pricing: empty, insertRows: () => Promise.resolve({ error: null }), log: quiet });
    ok(r.status === 'skipped' && !r.pricesAvailable && r.lines.length > 0, `status ${r.status}`);
    const eq = { lines: r.lines, gstRate: 0.05, pricesAvailable: r.pricesAvailable };
    for (const out of [generateBuyerConfirmationEmail(data, 'p', eq), buildAdminEmailHtml(data, 'p', eq), generateCSV(data, 'p', eq)]) {
      ok(!out.includes('$0.00') && !/\$\d/.test(out), 'printed money');
    }
    ok(generateBuyerConfirmationEmail(data, 'p', eq).includes(QUOTE_TO_FOLLOW_TEXT), 'no quote-to-follow note');
  });
}
