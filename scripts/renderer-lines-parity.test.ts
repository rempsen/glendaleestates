// Phase 2 Task 10 harness (spec §6.11): the buyer PDF and the Word export render from quote lines. Before the
// cutover both printed the Phase 1 engine's totals; after it they print sumQuoteLines over the lines. This proves the
// two agree to the cent on all nine live units, and pins the line-rendering rules (pending, notes, visibility).
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import {
  buildGenerateInputFromRow, pricingFromRows, referenceTotalsForRow, type SubmissionRow,
} from './lib/generateInputFromRow';
import { generateQuoteLines, countsInTotal, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { buildLineRows, CountedHiddenLineError, LINE_COLUMNS, INCLUDED_AMOUNT_TEXT, type LineRow } from '../src/lib/lineRenderRows';
import { savedSubmissionLines, GENERATED_LINES_NOTE } from '../src/lib/generateInputFromSelections';

const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const GST = pricing.gstRate;
const cents = (s: string) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);
const allRows = (m: ReturnType<typeof buildLineRows>): LineRow[] =>
  [...m.standard, ...m.upgrades.bySection.flatMap((s) => s.rows), ...m.notInTotal];

const line = (over: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 10, section: 'flooring', location: 'Kitchen', label: 'Test line', unit: 'flat', pricing_mode: 'manual',
  status: 'upgrade', client_visible: true, source: 'office', provisional: false, amount: 100, ...over,
});

test('fixture holds all nine live submissions', () => expect(rows.length).toBe(9));

describe('line-rendered totals equal the parity pins and sumQuoteLines', () => {
  for (const row of rows) {
    for (const buyerView of [true, false]) {
      test(`Unit ${row.unit_number} (${buyerView ? 'buyer' : 'staff'} copy)`, () => {
        const ref = referenceTotalsForRow(row, pricing);
        const lines = generateQuoteLines(buildGenerateInputFromRow(row, pricing));
        const m = buildLineRows(lines, { buyerView, gstRate: GST });

        // Renderer totals = sumQuoteLines over the lines = the parity pin, to the cent.
        expect(m.upgrades.subtotal.toFixed(2)).toBe(ref.upgradesSubtotal.toFixed(2));
        expect(m.upgrades.subtotal.toFixed(2)).toBe(ref.upgradesSubtotal.toFixed(2));
        expect(m.totals.windowCoverings.toFixed(2)).toBe(ref.windowSubtotal.toFixed(2));
        expect(m.totals.subtotal.toFixed(2)).toBe(ref.grandSubtotal.toFixed(2));
        expect(m.totals.gst.toFixed(2)).toBe(ref.gst.toFixed(2));
        expect(m.totals.total.toFixed(2)).toBe(ref.grandTotal.toFixed(2));
        expect(m.totals.total.toFixed(2)).toBe(ref.grandTotal.toFixed(2));

        // Every counted line is printed exactly once, and the printed rows add up to the printed totals.
        const countedRows = m.upgrades.bySection.flatMap((s) => s.rows);
        expect(countedRows.length).toBe(lines.filter(countsInTotal).length);
        const printed = countedRows.reduce((t, r) => t + cents(r.amount), 0);
        expect(printed).toBe(cents(m.totals.rows.find((r) => r.label === 'Subtotal')!.amountText));
        for (const s of m.upgrades.bySection) {
          expect(s.rows.reduce((t, r) => t + cents(r.amount), 0)).toBe(cents(s.subtotalText));
        }
        expect(m.totals.rows.map((r) => r.label)).toEqual(['Upgrades', 'Window coverings', 'Subtotal', 'GST 5%', 'Total']);
        expect(m.totals.rows.find((r) => r.label === 'Total')!.amountText).toBe(
          `$${ref.grandTotal.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      });
    }
  }
});

describe('rendering rules', () => {
  test('seven cells per row, matching the column header (location · item · product/colour · qty · unit price · amount · status)', () => {
    expect(LINE_COLUMNS).toEqual(['Location', 'Item', 'Product / colour', 'Qty', 'Unit price', 'Amount', 'Status']);
    for (const row of rows) {
      const m = buildLineRows(generateQuoteLines(buildGenerateInputFromRow(row, pricing)), { buyerView: false, gstRate: GST });
      for (const r of allRows(m)) expect(r.cells.length).toBe(LINE_COLUMNS.length);
    }
  });

  test('standard selections are the included lines, printed Included — $0.00 with no unit price', () => {
    const m = buildLineRows([line({ section: 'standard', status: 'included', amount: 0, unit_price: 0, label: 'Bathroom Tile' })], { buyerView: true, gstRate: GST });
    expect(m.standard.length).toBe(1);
    expect(m.standard[0].amount).toBe(INCLUDED_AMOUNT_TEXT);
    expect(INCLUDED_AMOUNT_TEXT).toBe('Included — $0.00');
    expect(m.standard[0].unitPrice).toBe('');
    expect(m.upgrades.bySection.length).toBe(0);
  });

  test('pending prints Pending — never $0.00 — even when an amount is stored', () => {
    const m = buildLineRows([
      line({ status: 'pending', amount: null, label: 'Pending A' }),
      line({ status: 'pending', amount: 0, label: 'Pending B' }),
      line({ status: 'pending', amount: 250, label: 'Pending C' }),
    ], { buyerView: true, gstRate: GST });
    expect(m.notInTotal.map((r) => r.amount)).toEqual(['Pending', 'Pending', 'Pending']);
    expect(m.notInTotal.every((r) => r.status === 'Pending')).toBe(true);
    expect(JSON.stringify(m.notInTotal).includes('$0.00')).toBe(false);
    expect(m.totals.total).toBe(0);
  });

  test('under review / deferred show their amount when known and are not in the total', () => {
    const m = buildLineRows([
      line({ status: 'under_review', amount: 1234.5, label: 'Review' }),
      line({ status: 'deferred', amount: null, label: 'Later', section: 'basement' }),
      line({ status: 'upgrade', amount: 100, label: 'Counted' }),
    ], { buyerView: true, gstRate: GST });
    expect(m.notInTotal.map((r) => [r.item, r.amount, r.status])).toEqual([
      ['Review', '$1,234.50', 'Under review'], ['Later', 'Pending', 'Deferred'],
    ]);
    expect(m.totals.subtotal).toBe(100);
  });

  test('a removed line never appears and never counts', () => {
    const lines = [line({ status: 'removed', amount: 999, label: 'GONE-LINE' }), line({ amount: 100 })];
    for (const buyerView of [true, false]) {
      const m = buildLineRows(lines, { buyerView, gstRate: GST });
      expect(JSON.stringify(m).includes('GONE-LINE')).toBe(false);
      expect(m.totals.subtotal).toBe(100);
    }
  });

  test('buyer copy: client-visible lines only, client_note under the line, no internal_note anywhere', () => {
    const lines = [
      line({ label: 'Shown', client_note: 'Matte finish please', internal_note: 'SECRET-INTERNAL-NOTE' }),
      line({ label: 'HIDDEN-LINE', client_visible: false, status: 'under_review', amount: 50 }),
    ];
    const buyer = buildLineRows(lines, { buyerView: true, gstRate: GST });
    expect(JSON.stringify(buyer).includes('SECRET-INTERNAL-NOTE')).toBe(false);
    expect(JSON.stringify(buyer).includes('HIDDEN-LINE')).toBe(false);
    expect(buyer.internalNotes).toEqual([]);
    const shown = buyer.upgrades.bySection[0].rows[0];
    expect(shown.clientNote).toBe('Matte finish please');
    expect(shown.cells[1]).toBe('Shown\nMatte finish please');
    expect(buyer.totals.subtotal).toBe(100);
  });

  test('buyer copy refuses a counted line hidden from the buyer (CountedHiddenLineError names the line)', () => {
    const lines = [line({ label: 'Shown' }), { ...line({ label: 'Counted but hidden', client_visible: false, amount: 50 }), id: 'line-42' }];
    expect(() => buildLineRows(lines, { buyerView: true, gstRate: GST })).toThrow(CountedHiddenLineError);
    expect(() => buildLineRows(lines, { buyerView: true, gstRate: GST })).toThrow(/line-42/);
    // Hidden lines outside the total are fine, and so is a hidden removed line; the staff copy never throws.
    expect(() => buildLineRows([line({ client_visible: false, status: 'pending', amount: null }), line({ client_visible: false, status: 'removed' })], { buyerView: true, gstRate: GST })).not.toThrow();
    expect(buildLineRows(lines, { buyerView: false, gstRate: GST }).totals.subtotal).toBe(150);
  });

  test('staff copy: all lines, internal notes in the separate block, never in the row cells', () => {
    const lines = [
      line({ label: 'Shown', internal_note: 'SECRET-INTERNAL-NOTE' }),
      line({ label: 'HIDDEN-LINE', client_visible: false, status: 'under_review', amount: 50 }),
    ];
    const staff = buildLineRows(lines, { buyerView: false, gstRate: GST });
    expect(staff.internalNotes).toEqual([{ location: 'Kitchen', item: 'Shown', note: 'SECRET-INTERNAL-NOTE' }]);
    expect(JSON.stringify(allRows(staff)).includes('SECRET-INTERNAL-NOTE')).toBe(false);
    expect(allRows(staff).some((r) => r.item === 'HIDDEN-LINE')).toBe(true);
    expect(staff.totals.subtotal).toBe(100); // the hidden line is under review, not in the total
  });

  test('premium upgrades are grouped in SECTION_ORDER with a subtotal per section', () => {
    const m = buildLineRows([
      line({ section: 'bathroom', amount: 10, sort_order: 10 }),
      line({ section: 'window_coverings', amount: 20, sort_order: 20 }),
      line({ section: 'flooring', amount: 30.255, sort_order: 30 }),
    ], { buyerView: true, gstRate: GST });
    expect(m.upgrades.bySection.map((s) => s.section)).toEqual(['flooring', 'window_coverings', 'bathroom']);
    expect(m.upgrades.bySection.map((s) => s.title)).toEqual(['Flooring', 'Window coverings', 'Bathroom']);
    expect(m.upgrades.subtotal).toBeCloseTo(40.255, 10); // amounts keep full precision; display rounds
    expect(m.totals.windowCoverings).toBe(20);
  });

  test('buyer wording is applied at render time', () => {
    const m = buildLineRows([line({ location: 'Master Bedroom', label: 'Premium Carpet — Master Bedroom' })], { buyerView: true, gstRate: GST });
    const r = m.upgrades.bySection[0].rows[0];
    expect(r.location).toBe('Primary Bedroom');
    expect(r.item).toBe('Premium Carpet — Primary Bedroom');
  });

  test('a provisional line says so in the status column', () => {
    const m = buildLineRows([line({ section: 'standard', status: 'included', amount: 0, provisional: true })], { buyerView: true, gstRate: GST });
    expect(m.standard[0].status).toBe('Included (provisional)');
  });

  test('quantity and unit price columns', () => {
    const m = buildLineRows([line({ quantity: 1150, unit: 'sqft', unit_price: 8.8, amount: 10120 })], { buyerView: true, gstRate: GST });
    const r = m.upgrades.bySection[0].rows[0];
    expect([r.qty, r.unitPrice, r.amount, r.status]).toEqual(['1,150 sq ft', '$8.80', '$10,120.00', 'Upgrade']);
  });
});

describe('saved-submission line source (fallback until the backfill runs)', () => {
  const row = rows.find((r) => r.unit_number === '31')!;
  test('no stored lines → generated from the row, marked generated', () => {
    const { lines, linesSource } = savedSubmissionLines([], row, pricing);
    expect(linesSource).toBe('generated');
    expect(lines).toEqual(generateQuoteLines(buildGenerateInputFromRow(row, pricing)));
    const m = buildLineRows(lines, { buyerView: true, gstRate: GST });
    expect(m.totals.total.toFixed(2)).toBe(referenceTotalsForRow(row, pricing).grandTotal.toFixed(2));
    expect(GENERATED_LINES_NOTE).toBe('Generated from selections (not yet itemised)');
  });
  test('stored lines win, in sort_order, without removed ones', () => {
    const stored = [
      { ...line({ label: 'B', sort_order: 20 }), id: 'b', location: null },
      { ...line({ label: 'GONE', sort_order: 15, status: 'removed' }), id: 'g' },
      { ...line({ label: 'A', sort_order: 10 }), id: 'a' },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { lines, linesSource } = savedSubmissionLines(stored as any, row, pricing);
    expect(linesSource).toBe('db');
    expect(lines.map((l) => l.label)).toEqual(['A', 'B']);
    expect(lines[1].location).toBe('');
  });
});

describe('all-removed stored lines (fix round 1)', () => {
  const row = rows.find((r) => r.unit_number === '31')!;
  test('an all-removed stored set is db with no lines — staff deletions are never resurrected', () => {
    const stored = [
      { ...line({ label: 'GONE-A', status: 'removed' }), id: 'a' },
      { ...line({ label: 'GONE-B', status: 'removed', section: 'standard' }), id: 'b' },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { lines, linesSource } = savedSubmissionLines(stored as any, row, pricing);
    expect(linesSource).toBe('db');
    expect(lines).toEqual([]);
    const m = buildLineRows(lines, { buyerView: true, gstRate: GST });
    expect(m.upgrades.bySection).toEqual([]);
    expect(m.standard).toEqual([]);
    expect(m.totals.total).toBe(0);
  });
  test('the context query does not filter by status', () => {
    const src = readFileSync(join(import.meta.dir, '../src/lib/savedSubmissionPdf.ts'), 'utf8');
    expect(src).toContain("from('quote_lines').select('*').eq('submission_id', id).order(");
    expect(src.includes(".neq('status'")).toBe(false);
  });
});

describe('the two renderers carry no arithmetic of their own', () => {
  const src = (f: string) => readFileSync(join(import.meta.dir, '../src/lib', f), 'utf8');
  for (const f of ['buyerPdfGenerator.ts', 'savedSubmissionPdf.ts', 'submissionWordExport.ts', 'submissionWordRows.ts']) {
    test(f, () => {
      const s = src(f);
      for (const bad of ['computeUpgradeTotals', 'markup', '* 1.05', 'totalsInputFromSelections(', 'buildPremiumUpgradeRows', 'buildStandardSelectionRows']) {
        expect(`${f}: ${s.includes(bad) ? bad : ''}`).toBe(`${f}: `);
      }
    });
  }
  test('Word export fails closed: staff defaults to false; staff call sites pass true explicitly', () => {
    expect(src('submissionWordExport.ts')).toContain('export async function downloadSubmissionWord(id: string, staff = false)');
    const root = join(import.meta.dir, '..');
    expect(readFileSync(join(root, 'src/lib/consoleActions.ts'), 'utf8')).toContain("case 'word_staff': await r.word(id, true)");
  });
  test('both renderers read lines through buildLineRows and the shared context', () => {
    expect(src('buyerPdfGenerator.ts')).toContain('buildLineRows(');
    expect(src('submissionWordExport.ts')).toContain('buildLineRows(');
    expect(src('submissionWordExport.ts')).toContain('loadSavedSubmissionContext(');
    expect(src('savedSubmissionPdf.ts')).toContain("from('quote_lines')");
  });
});

describe('the real PDF renderer (jsPDF, uncompressed text)', () => {
  const { generateBuyerPreviewPDF } = require('../src/lib/buyerPdfGenerator') as typeof import('../src/lib/buyerPdfGenerator');
  const sel = { unitNumber: '31', firstName: 'A', lastName: 'B', upgradeInterests: {}, areaUpgrades: [] } as never;
  const lines = [
    line({ label: 'Counted line', amount: 1005, client_note: 'Buyer-visible note', internal_note: 'SECRET-INTERNAL-NOTE' }),
    line({ label: 'Awaiting price', status: 'pending', amount: 0 }),
    line({ label: 'HIDDEN-LINE', client_visible: false, status: 'under_review', amount: 50 }),
    line({ label: 'GONE-LINE', status: 'removed', amount: 75 }),
    // A counted window line keeps every totals row non-zero, so any "$0.00" could only come from the pending line.
    line({ label: 'Panel track', section: 'window_coverings', amount: 2680.5 }),
  ];
  const esc = (t: string) => t.replace(/[()]/g, (c) => `\\${c}`); // PDF string escaping
  const render = async (staff: boolean) => {
    const warn = console.warn; console.warn = () => {}; // no Image() in bun: the logo load fails quietly
    try {
      const b64 = await generateBuyerPreviewPDF(sel, { lines, gstRate: GST }, {
        returnBase64: true, saveToFile: false,
        ...(staff ? { staffRecord: { status: 'submitted' }, sourceNote: GENERATED_LINES_NOTE } : { sourceNote: GENERATED_LINES_NOTE }),
      });
      return Buffer.from(b64 as string, 'base64').toString('latin1');
    } finally { console.warn = warn; }
  };
  test('buyer copy: no internal note, no hidden or removed line, Pending not $0.00, no source note', async () => {
    const pdf = await render(false);
    expect(pdf.includes('Counted line')).toBe(true);
    expect(pdf.includes('Buyer-visible note')).toBe(true);
    expect(pdf.includes('$1,005.00')).toBe(true);
    expect(pdf.includes('Awaiting price')).toBe(true);
    expect(pdf.includes('Pending')).toBe(true);
    expect(pdf.includes('$0.00')).toBe(false);
    for (const bad of ['SECRET-INTERNAL-NOTE', 'HIDDEN-LINE', 'GONE-LINE', 'Internal notes', 'not yet itemised']) expect(pdf.includes(bad)).toBe(false);
  });
  test('staff copy: hidden line, internal-notes block and the generated-lines footer note; never a removed line', async () => {
    const pdf = await render(true);
    for (const want of ['HIDDEN-LINE', 'SECRET-INTERNAL-NOTE', esc('Internal notes (never printed for the buyer)'), esc('Generated from selections (not yet itemised)')]) expect(pdf.includes(want)).toBe(true);
    expect(pdf.includes('GONE-LINE')).toBe(false);
    // The internal block comes after all buyer-safe content.
    expect(pdf.indexOf('Total \\(incl. GST\\)')).toBeGreaterThan(0);
    expect(pdf.indexOf('SECRET-INTERNAL-NOTE')).toBeGreaterThan(pdf.indexOf('Total \\(incl. GST\\)'));
  });
});

describe('colour names (fix round 1): stored ids print as names, as Phase 1 resolveOptionName did', () => {
  const SLUG = /^[a-z0-9]+(-[a-z0-9]+)+$/;
  test('no slug-shaped product/colour text in any buyer row across the 9 fixtures', () => {
    for (const row of rows) {
      const m = buildLineRows(generateQuoteLines(buildGenerateInputFromRow(row, pricing)), { buyerView: true, gstRate: GST });
      for (const r of allRows(m)) for (const part of r.product.split(' — ')) expect(`${row.unit_number}: ${SLUG.test(part) ? part : ''}`).toBe(`${row.unit_number}: `);
    }
  });
  test('the units that printed raw ids now print names', () => {
    const product = (unit: string, item: string) => {
      const m = buildLineRows(generateQuoteLines(buildGenerateInputFromRow(rows.find((r) => r.unit_number === unit)!, pricing)), { buyerView: true, gstRate: GST });
      return allRows(m).filter((r) => r.item === item).map((r) => r.product);
    };
    expect(product('43', 'Bathroom Tile')).toEqual(['Ceratec Dante 2.0 — Venatino Auguste', 'Ceratec Dante 2.0 — Venatino Auguste']);
    expect(product('7', 'Premium underpad')).toContain('Winterbrooke 898');
  });
  test('_shared/optionNames.ts mirrors mockData: every id, name and alias resolves as resolveOptionName', async () => {
    const { lvpOptions, spcTileOptions, carpetOptions, resolveOptionName } = await import('../src/lib/mockData');
    const { OPTION_NAMES, OPTION_ALIASES, COLOUR_NAMES, colourKey } = await import('../supabase/functions/_shared/optionNames.ts');
    const all = [...lvpOptions, ...spcTileOptions, ...carpetOptions];
    expect(OPTION_NAMES).toEqual(Object.fromEntries(all.map((o) => [o.id, o.name])));
    for (const v of [...all.map((o) => o.id), ...all.map((o) => o.name), ...Object.keys(OPTION_ALIASES), 'Venatino Polished', 'Jet Stream']) {
      expect(COLOUR_NAMES[colourKey(v)]).toBe(resolveOptionName(all, v)!);
    }
    expect(resolveOptionName(all, 'Linen')).toBe('Linen'); // unknown values kept as typed, both sides
    expect(COLOUR_NAMES[colourKey('Linen')]).toBeUndefined();
  });
});
