// Deno edge-string tests for resend-confirmation-email (Phase 2 Task 11). Run: deno test supabase/functions/
// No-ops under bun; the bun mirror over all nine live units is scripts/email-lines.test.ts.
import { buildAdminHtml, buildBuyerHtml, linesGrandTotal } from './emails.ts';
import { LINE_COLUMNS } from '../_shared/lineRenderRows.ts';
import { savedSubmissionLinesCore } from '../_shared/savedSubmissionLines.ts';
import { PREVIEW_PRICING } from '../send-selections-email/emails.ts';
import { sumQuoteLines, type QuoteLine } from '../_shared/quoteLines.ts';
import { MY_QUOTE_LINK_TEXT, MY_QUOTE_URL } from '../_shared/buyerContact.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };

if (denoTest) {
  const sub = {
    id: 'sub-r', unit_number: '24', unit_type: 'Unit Type C', first_name: 'Ann', last_name: 'Lee', email: 'a@b.co',
    additional_windows_qty: 1, patio_doors_qty: 1, automated_windows_qty: 0, backsplash_grout_enabled: true,
    sales_comments: 'SALES-ONLY note', admin_notes: 'ADMIN-ONLY note',
  };
  const stored: QuoteLine[] = [
    { id: 'l1', sort_order: 1, section: 'window_coverings', location: 'Living Room', label: 'Additional window covering', unit: 'each',
      quantity: 1, unit_price: 673.5, amount: 673.5, pricing_mode: 'flat_rate', status: 'upgrade', client_visible: true, source: 'wizard',
      provisional: false, internal_note: 'INTERNAL-ONLY measure twice' },
    { id: 'l2', sort_order: 2, section: 'other', location: 'Kitchen', label: 'Accent wall', unit: 'flat', amount: null,
      pricing_mode: 'manual', status: 'pending', client_visible: true, source: 'office', provisional: false },
  ];

  denoTest('stored lines win over the generator', () => {
    const r = savedSubmissionLinesCore(stored, sub, PREVIEW_PRICING);
    ok(r.linesSource === 'db' && r.lines.length === 2, 'expected stored lines');
    const g = savedSubmissionLinesCore([], sub, PREVIEW_PRICING);
    ok(g.linesSource === 'generated' && g.lines.length > 2, 'expected generated fallback');
  });

  denoTest('buyer + admin copies: seven columns, Pending not $0.00, totals from sumQuoteLines', () => {
    const q = { lines: stored, gstRate: 0.05, pricesAvailable: true, linesSource: 'db' as const };
    const total = sumQuoteLines(stored, 0.05).total;
    ok(linesGrandTotal(q) === total, `grand total ${linesGrandTotal(q)} vs ${total}`);
    for (const html of [buildBuyerHtml(sub, q), buildAdminHtml(sub, q, 'Admin')]) {
      for (const c of LINE_COLUMNS) ok(html.includes(`>${c}</th>`), `missing ${c}`);
      const row = html.split('<tr>').find((r) => r.includes('Accent wall'))!;
      ok(row.includes('Pending') && !row.includes('$0.00'), row);
      ok(html.includes('$707.18'), 'total missing'); // 673.50 × 1.05
    }
  });

  denoTest('buyer copy never carries internal_note, sales_comments or admin_notes', () => {
    const q = { lines: stored, gstRate: 0.05, pricesAvailable: true };
    const buyer = buildBuyerHtml(sub, q);
    ok(!buyer.includes('INTERNAL-ONLY') && !buyer.includes('SALES-ONLY') && !buyer.includes('ADMIN-ONLY'), 'leak');
    ok(buildAdminHtml(sub, q, 'Admin').includes('INTERNAL-ONLY'), 'staff copy lost the internal note');
  });
  denoTest('grandTotal follows the buyer copy: null when it printed no prices', () => {
    ok(linesGrandTotal({ lines: stored, gstRate: 0.05, pricesAvailable: false }) === null, 'expected null without prices');
    const hidden: QuoteLine = { ...stored[0], id: 'l3', client_visible: false };
    const err = console.error; console.error = () => {};
    try { ok(linesGrandTotal({ lines: [...stored, hidden], gstRate: 0.05, pricesAvailable: true }) === null, 'expected null for a hidden counted line'); }
    finally { console.error = err; }
  });

  denoTest('buyer copy links to the live quote at /my-quote', () => {
    const html = buildBuyerHtml(sub, { lines: stored, gstRate: 0.05, pricesAvailable: true });
    ok(html.includes(`href="${MY_QUOTE_URL}"`) && html.includes(MY_QUOTE_LINK_TEXT), 'missing /my-quote link');
  });
}
