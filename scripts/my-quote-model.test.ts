// Phase 2 Task 13: the buyer review page model (/my-quote, spec §6.7, §6.15, §6.16, Review Focus 2 and 4).
import { test, expect, describe } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines, sumQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import {
  buildMyQuoteState, stateFromBuyerLines, pickHeader, changeRequestArgs, isMissingRpc, changeRequestErrorText, NOT_ITEMISED_TEXT, latestReviewByLine, toBuyerLine, validateChangeRequest, validateReviewComment, buyerPdfSelectionsFromHeader,
  NO_QUOTE_TEXT, UNAVAILABLE_TEXT, CHANGE_REQUEST_MAX, REVIEW_COMMENT_MAX,
  type MyQuoteHeader, type MyQuoteRpcLine, type LineReview,
} from '../src/lib/myQuoteModel';
import { OFFICE_CONTACT_TEXT, OFFICE_EMAIL } from '../supabase/functions/_shared/buyerContact.ts';
import { MyQuoteView } from '../src/components/buyer/MyQuoteView';

const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const GST = pricing.gstRate;
const SECRETS = ['INTERNAL-SECRET', 'SALES-SECRET', 'ADMIN-SECRET', 'flag-user-uuid', 'material:secret-ref'];

const header = (over: Partial<MyQuoteHeader> = {}): MyQuoteHeader => ({
  submission_id: 'sub-1', unit_number: '24', unit_type: 'Unit Type C', first_name: 'Ann', last_name: 'Lee', email: 'ann@gmail.com',
  phone_number: '204-555-0100', estimated_possession_date: '2027-09-15', status: 'submitted', created_at: '2026-11-01T00:00:00Z', ...over,
});

/** What get_my_quote_lines() returns for a line, plus internal fields an unsafe caller might leak into the input. */
const rpc = (over: Partial<MyQuoteRpcLine> & Record<string, unknown> = {}): MyQuoteRpcLine => ({
  id: 'l1', submission_id: 'sub-1', section: 'flooring', location: 'Kitchen', label: 'LVP upgrade', product_name: 'Harbinger',
  product_colour: 'Oak', quantity: 10, unit: 'sqft', unit_price: 5, amount: 50, status: 'upgrade', client_note: null,
  provisional: false, sort_order: 1, ...over,
} as MyQuoteRpcLine);

/** Simulates the RPC over generated lines: client-visible, not removed, buyer-safe columns only. */
const asRpc = (lines: QuoteLine[], submissionId: string): MyQuoteRpcLine[] => lines
  .filter((l) => l.client_visible && l.status !== 'removed')
  .map((l, i) => ({
    id: l.id ?? `gen-${i}`, submission_id: submissionId, section: l.section, location: l.location, label: l.label,
    product_name: l.product_name ?? null, product_colour: l.product_colour ?? null, quantity: l.quantity ?? null, unit: l.unit,
    unit_price: l.unit_price ?? null, amount: l.amount ?? null, status: l.status, client_note: l.client_note ?? null,
    provisional: l.provisional, sort_order: l.sort_order,
  }));

describe('toBuyerLine / buildMyQuoteState privacy', () => {
  const leaky = rpc({
    internal_note: 'INTERNAL-SECRET', sales_comments: 'SALES-SECRET', admin_notes: 'ADMIN-SECRET',
    flagged_to: 'flag-user-uuid', price_source_ref: 'material:secret-ref',
  });

  test('allow-list drops internal fields even when present in the input', () => {
    const l = toBuyerLine(leaky) as unknown as Record<string, unknown>;
    for (const k of ['internal_note', 'sales_comments', 'admin_notes', 'flagged_to', 'price_source_ref']) expect(l[k] ?? null).toBeNull();
    expect(JSON.stringify(l)).not.toMatch(/SECRET|flag-user-uuid|secret-ref/);
    expect(l.client_visible).toBe(true);
  });

  test('state and rendered DOM carry no internal field', () => {
    const state = buildMyQuoteState({ headers: [header()], lines: [leaky], reviews: [], gstRate: GST });
    expect(state.kind).toBe('ready');
    const html = renderToStaticMarkup(createElement(MyQuoteView, { state, onReview: () => {}, onRequestChange: () => {} }));
    for (const s of SECRETS) {
      expect(JSON.stringify(state)).not.toContain(s);
      expect(html).not.toContain(s);
    }
    expect(html).toContain('LVP upgrade');
  });
});

describe('reviews', () => {
  const r = (over: Partial<LineReview>): LineReview => ({ line_id: 'l1', response: 'accepted', comment: null, created_at: '2026-11-18T10:00:00Z', ...over });

  test('latest response per line wins, whatever the input order', () => {
    const m = latestReviewByLine([
      r({ created_at: '2026-11-18T12:00:00Z', response: 'questioned', comment: 'Why this price?' }),
      r({ created_at: '2026-11-18T10:00:00Z', response: 'accepted' }),
      r({ line_id: 'l2', created_at: '2026-11-17T09:00:00Z', response: 'accepted' }),
      r({ created_at: '2026-11-18T11:00:00Z', response: 'accepted' }),
    ]);
    expect(m.get('l1')).toMatchObject({ response: 'questioned', comment: 'Why this price?' });
    expect(m.get('l2')?.response).toBe('accepted');
    expect(m.size).toBe(2);
  });

  test('ready state attaches the latest review to its row', () => {
    const state = buildMyQuoteState({
      headers: [header()], lines: [rpc()], gstRate: GST,
      reviews: [r({ response: 'accepted', created_at: '2026-11-18T09:00:00Z' }), r({ response: 'questioned', created_at: '2026-11-18T09:30:00Z' })],
    });
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.reviews.get('l1')?.response).toBe('questioned');
  });

  test('comment and change-request limits', () => {
    expect(REVIEW_COMMENT_MAX).toBe(500);
    expect(CHANGE_REQUEST_MAX).toBe(300);
    expect(validateReviewComment('  ')).toEqual({ ok: true, comment: null });
    expect(validateReviewComment(' ok ')).toEqual({ ok: true, comment: 'ok' });
    expect(validateReviewComment('x'.repeat(501)).ok).toBe(false);
    expect(validateChangeRequest('   ').ok).toBe(false);
    expect(validateChangeRequest('x'.repeat(301)).ok).toBe(false);
    expect(validateChangeRequest(' Add a pot light ')).toEqual({ ok: true, text: 'Add a pot light' });
  });
});

describe('no quote for this sign-in (Review Focus 4)', () => {
  test('email mismatch (RPC returns nothing) yields the office contact, never another quote', () => {
    const state = buildMyQuoteState({ headers: [], lines: [], reviews: [], gstRate: GST });
    expect(state).toEqual({ kind: 'no_quote', title: NO_QUOTE_TEXT, contact: OFFICE_CONTACT_TEXT });
    expect(NO_QUOTE_TEXT).toBe('No quote found for this sign-in');
    expect(OFFICE_CONTACT_TEXT).toContain(OFFICE_EMAIL);
    const html = renderToStaticMarkup(createElement(MyQuoteView, { state, onReview: () => {}, onRequestChange: () => {} }));
    expect(html).toContain(NO_QUOTE_TEXT);
    expect(html).toContain(OFFICE_EMAIL);
  });

  test('only the newest submission for the email is shown', () => {
    const state = buildMyQuoteState({
      headers: [header({ submission_id: 'new' }), header({ submission_id: 'old' })],
      lines: [rpc({ id: 'a', submission_id: 'old', label: 'OLD LINE' }), rpc({ id: 'b', submission_id: 'new', label: 'NEW LINE' })],
      reviews: [], gstRate: GST,
    });
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.submissionId).toBe('new');
    expect(JSON.stringify(state)).not.toContain('OLD LINE');
  });

  test('newest submission THAT HAS LINES wins over a newer empty one; no lines at all falls back to the newest', () => {
    const headers = [header({ submission_id: 'new' }), header({ submission_id: 'old', unit_number: '7' })];
    const state = buildMyQuoteState({ headers, lines: [rpc({ id: 'a', submission_id: 'old', label: 'OLD LINE' })], reviews: [], gstRate: GST });
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.submissionId).toBe('old');
    expect(state.header?.unit_number).toBe('7');
    expect(pickHeader(headers, [])?.submission_id).toBe('new');
    // "Request a change" targets the submission on screen ('old'), not the newer hidden one the RPC would pick.
    expect(changeRequestArgs(state, 'Add blinds')).toEqual({ _text: 'Add blinds', _submission_id: 'old' });
    expect(pickHeader([], [])).toBeNull();
  });

  test('get_my_quote_header missing (PGRST202, 0012 not applied): renders from the lines alone as "Your quote"', () => {
    expect(isMissingRpc({ code: 'PGRST202' })).toBe(true);
    expect(isMissingRpc({ code: '42501' })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
    const state = buildMyQuoteState({ headers: [], lines: [rpc()], reviews: [], gstRate: GST });
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.header).toBeNull();
    const html = renderToStaticMarkup(createElement(MyQuoteView, { state, onReview: async () => {}, onRequestChange: async () => {} }));
    expect(html).toContain('Your quote');
  });

  test('request_quote_change on an un-itemised quote shows the itemise-first text; other errors the office contact', () => {
    expect(changeRequestErrorText({ message: 'This quote has not been itemised yet; please contact the office' })).toBe(NOT_ITEMISED_TEXT);
    expect(changeRequestErrorText({ message: 'boom' })).toBe(OFFICE_CONTACT_TEXT);
    expect(changeRequestErrorText(null)).toBe(OFFICE_CONTACT_TEXT);
  });

  test('a counted hidden line (never returned by the RPC) shows the office contact instead of throwing', () => {
    const hidden = { ...toBuyerLine(rpc()), client_visible: false };
    const state = stateFromBuyerLines({ header: header(), lines: [hidden], reviews: [], gstRate: GST });
    expect(state).toEqual({ kind: 'unavailable', title: UNAVAILABLE_TEXT, contact: OFFICE_CONTACT_TEXT });
  });

  test('a submission with no lines yet says the quote is being prepared, with the office contact', () => {
    const state = buildMyQuoteState({ headers: [header()], lines: [], reviews: [], gstRate: GST });
    expect(state).toMatchObject({ kind: 'empty', contact: OFFICE_CONTACT_TEXT });
  });
});

describe('Pending never prints as $0.00 (Review Focus 2)', () => {
  test('a pending line renders Pending in the page', () => {
    const state = buildMyQuoteState({
      headers: [header()], gstRate: GST, reviews: [],
      lines: [rpc({ id: 'p', status: 'pending', amount: null, unit_price: null, quantity: null, label: 'Accent wall', section: 'other' })],
    });
    if (state.kind !== 'ready') throw new Error(state.kind);
    expect(state.model.notInTotal[0].amount).toBe('Pending');
    const html = renderToStaticMarkup(createElement(MyQuoteView, { state, onReview: () => {}, onRequestChange: () => {} }));
    // The line's own row (table and rail) never shows $0.00; the empty totals block legitimately reads $0.00.
    const row = html.split('<tr').find((r) => r.includes('Accent wall'))!.split('</tr>')[0];
    expect(row).toContain('>Pending<');
    expect(row).not.toContain('$0.00');
    const rail = html.split('<li').find((r) => r.includes('Accent wall'))!.split('</li>')[0];
    expect(rail).toContain('Pending');
    expect(rail).not.toContain('$0.00');
  });
});

describe('totals equal sumQuoteLines on the nine live units', () => {
  const rows = liveSubmissions as unknown as SubmissionRow[];
  test('fixture has nine units', () => expect(rows.length).toBe(9));
  for (const row of rows) {
    test(`Unit ${row.unit_number}`, () => {
      const lines = generateQuoteLines(buildGenerateInputFromRow(row, pricing));
      const rpcRows = asRpc(lines, 'sub-x');
      const state = buildMyQuoteState({ headers: [header({ submission_id: 'sub-x' })], lines: rpcRows, reviews: [], gstRate: GST });
      if (state.kind !== 'ready') throw new Error(state.kind);
      const expected = sumQuoteLines(lines.filter((l) => l.client_visible && l.status !== 'removed'), GST);
      expect(state.model.totals.total.toFixed(2)).toBe(expected.total.toFixed(2));
      expect(state.model.totals.subtotal.toFixed(2)).toBe(expected.subtotal.toFixed(2));
      expect(state.model.totals.gst.toFixed(2)).toBe(expected.gst.toFixed(2));
      // The buyer copy equals the staff total: counted lines are always visible (migration 0010).
      expect(state.model.totals.total.toFixed(2)).toBe(sumQuoteLines(lines, GST).total.toFixed(2));
    });
  }
});

describe('buyer PDF selections from the header', () => {
  test('identity only; no comments, custom pricing or area notes', () => {
    const s = buyerPdfSelectionsFromHeader(header());
    expect(s).toMatchObject({ unitNumber: '24', firstName: 'Ann', lastName: 'Lee', email: 'ann@gmail.com', phoneNumber: '204-555-0100' });
    expect(s.areaUpgrades).toEqual([]);
    expect(s.customPricing ?? null).toBeNull();
    expect(s.salesComments ?? '').toBe('');
  });
});

describe('console Buyer column and sign-in redirect', () => {
  test('label shows the latest response and comment', async () => {
    const { buyerResponseLabel } = await import('../src/lib/myQuoteModel');
    expect(buyerResponseLabel(undefined)).toBe('Buyer: no response');
    expect(buyerResponseLabel({ line_id: 'l', response: 'questioned', comment: 'Why?', created_at: '2026-11-18T00:00:00Z' }))
      .toBe('Buyer: Questioned — “Why?”');
    expect(buyerResponseLabel({ line_id: 'l', response: 'accepted', comment: null, created_at: '2026-11-18T00:00:00Z' })).toBe('Buyer: Accepted');
  });

  test('buyer-auth next is allow-listed (no open redirect)', async () => {
    const { safeBuyerNext, buyerAuthPath } = await import('../src/lib/buyerNext');
    expect(safeBuyerNext('/my-quote')).toBe('/my-quote');
    expect(safeBuyerNext('https://evil.example')).toBe('/select');
    expect(safeBuyerNext('//evil.example')).toBe('/select');
    expect(safeBuyerNext(null)).toBe('/select');
    expect(buyerAuthPath('/my-quote')).toBe('/buyer-auth?mode=signin&next=%2Fmy-quote');
  });

  test('the buyer page reads only through the RPCs, never quote_lines or buyer_selections', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(import.meta.dir, '..');
    for (const f of ['src/pages/MyQuote.tsx', 'src/components/buyer/MyQuoteView.tsx', 'src/lib/myQuoteModel.ts']) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(`${f}:${/from\('(quote_lines|buyer_selections)'\)/.test(src)}`).toBe(`${f}:false`);
      expect(`${f}:${/staff\s*[:=]\s*true|, true\)/.test(src)}`).toBe(`${f}:false`);
    }
    const page = readFileSync(join(root, 'src/pages/MyQuote.tsx'), 'utf8');
    expect(page).toContain("supabase.rpc('get_my_quote_lines')");
    expect(page).toContain("supabase.rpc('get_my_quote_header')");
    expect(page).toContain("supabase.rpc('request_quote_change', changeRequestArgs(state, text))");
    // Own reviews only; a failed insert throws so the buyer's comment is kept.
    expect(page).toContain(".eq('buyer_user_id', userId)");
    expect(page).toMatch(/Your response was not saved[^\n]*throw error;/);
    // Console hook: no unfiltered Realtime subscription (table not in the publication).
    expect(readFileSync(join(root, 'src/hooks/useLineReviews.ts'), 'utf8')).not.toMatch(/\.channel\(|postgres_changes/);
    const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
    expect(app).toContain('<Route path="/my-quote" element={<BuyerRoute><MyQuote /></BuyerRoute>} />');
  });
});

describe('changeRequestArgs', () => {
  test('no ready state → text only (the RPC picks the newest itemised submission)', () => {
    expect(changeRequestArgs(null, 'x')).toEqual({ _text: 'x' });
    expect(changeRequestArgs({ kind: 'no_quote', title: 't', contact: 'c' }, 'x')).toEqual({ _text: 'x' });
  });
});
