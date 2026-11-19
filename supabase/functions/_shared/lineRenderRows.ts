// Line-based rows for the buyer PDF and the Word export (Phase 2 Task 10, spec §6.11). Pure: lines in, rows out.
// No arithmetic here: every sum comes from sumQuoteLines (the same function as the RunningTotal rail), and amounts are
// rounded for display only. Columns everywhere: location · item · product/colour · qty · unit price · amount · status.
// Canonical copy (Phase 2 Task 11): lives in supabase/functions/_shared so the email edge functions render the same
// rows as the PDF/Word; src/lib/lineRenderRows.ts re-exports it. Zero non-relative imports (Deno + bun + Vite).
import { sumQuoteLines, countsInTotal, SECTION_ORDER, type QuoteLine, type LineStatus, type Section, type LineUnit } from './quoteLines.ts';
import { toBuyerWording } from './buyerWording.ts';

export const PENDING_TEXT = 'Pending';
export function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const LINE_COLUMNS = ['Location', 'Item', 'Product / colour', 'Qty', 'Unit price', 'Amount', 'Status'] as const;
export const INCLUDED_AMOUNT_TEXT = 'Included — $0.00';
/**
 * Backstop for counted ⇒ client_visible (migration 0010, quoteLinesReducer): the buyer copy refuses to render a counted
 * line hidden from the buyer, because dropping it would silently shrink the buyer's Total below the staff/QBO total.
 */
export class CountedHiddenLineError extends Error {
  constructor(public readonly lineId: string) {
    super(`Line ${lineId} counts in the total but is hidden from the buyer; make it visible or move it out of the total`);
    this.name = 'CountedHiddenLineError';
  }
}

export const INTERNAL_NOTES_HEADING = 'Internal notes (never printed for the buyer)';

export const SECTION_TITLES: Record<Section, string> = {
  standard: 'Standard', flooring: 'Flooring', tile: 'Tile', backsplash: 'Backsplash', stairs: 'Stairs',
  window_coverings: 'Window coverings', bathroom: 'Bathroom', basement: 'Basement', other: 'Other',
};

const STATUS_TEXT: Record<LineStatus, string> = {
  included: 'Included', upgrade: 'Upgrade', pending: 'Pending', under_review: 'Under review', deferred: 'Deferred', removed: 'Removed',
};
const UNIT_TEXT: Record<LineUnit, string> = { sqft: 'sq ft', sqyd: 'sq yd', each: '', flat: '' };

export interface LineRow {
  key: string;
  location: string; item: string; product: string; qty: string; unitPrice: string; amount: string; status: string;
  /** Buyer-visible note printed under the line (both copies). */
  clientNote: string | null;
  /** The seven printed cells; the item cell carries the client note on a second line. */
  cells: string[];
}
export interface SectionGroup { section: Section; title: string; rows: LineRow[]; subtotal: number; subtotalText: string }
export type TotalLabel = 'Upgrades' | 'Window coverings' | 'Subtotal' | 'GST 5%' | 'Total';
export interface LineTotals {
  upgrades: number; windowCoverings: number; subtotal: number; gst: number; total: number;
  rows: Array<{ label: TotalLabel; amount: number; amountText: string }>;
}
export interface InternalNote { location: string; item: string; note: string }
export interface LineRenderModel {
  standard: LineRow[];
  /** Counted lines by section. `subtotal` is the Upgrades total (window coverings excluded), as the engine's upgradesSubtotal. */
  upgrades: { bySection: SectionGroup[]; subtotal: number };
  notInTotal: LineRow[];
  totals: LineTotals;
  /** Staff copy only (empty for the buyer): printed in a block after all buyer-safe content. */
  internalNotes: InternalNote[];
}

const text = (s: string | null | undefined) => toBuyerWording((s ?? '').trim());
const qtyText = (l: QuoteLine) => {
  if (l.quantity == null) return '';
  const n = l.quantity.toLocaleString('en-CA', { maximumFractionDigits: 2 });
  return [n, UNIT_TEXT[l.unit]].filter(Boolean).join(' ');
};
const sectionRank = (l: QuoteLine) => SECTION_ORDER.indexOf(l.section);
const keyOf = (l: QuoteLine, i: number) => l.id ?? `${l.sort_order}-${l.section}-${l.location}-${l.label}-${i}`;

function toRow(l: QuoteLine, i: number, kind: 'standard' | 'counted' | 'notInTotal'): LineRow {
  const amount = kind === 'standard' ? INCLUDED_AMOUNT_TEXT
    : kind === 'counted' ? formatMoney(l.amount as number)
    : l.status === 'pending' || l.amount == null ? PENDING_TEXT : formatMoney(l.amount);
  const unitPrice = kind === 'standard' || l.unit_price == null || (kind === 'notInTotal' && amount === PENDING_TEXT) ? '' : formatMoney(l.unit_price);
  const base = kind === 'notInTotal' && l.status === 'upgrade' ? STATUS_TEXT.pending : STATUS_TEXT[l.status];
  const status = l.provisional ? `${base} (provisional)` : base;
  const clientNote = text(l.client_note) || null;
  const row = {
    key: keyOf(l, i), location: text(l.location), item: text(l.label),
    product: [text(l.product_name), text(l.product_colour)].filter(Boolean).filter((v, j, a) => a.indexOf(v) === j).join(' — '),
    qty: kind === 'standard' ? '' : qtyText(l), unitPrice, amount, status, clientNote,
  };
  return { ...row, cells: [row.location, clientNote ? `${row.item}\n${clientNote}` : row.item, row.product, row.qty, row.unitPrice, row.amount, row.status] };
}

export function buildLineRows(lines: QuoteLine[], opts: { buyerView: boolean; gstRate: number }): LineRenderModel {
  if (opts.buyerView) {
    const bad = lines.findIndex((l) => l.status !== 'removed' && countsInTotal(l) && l.client_visible === false);
    if (bad >= 0) throw new CountedHiddenLineError(lines[bad].id ?? keyOf(lines[bad], bad));
  }
  const visible = lines.filter((l) => l.status !== 'removed' && (!opts.buyerView || l.client_visible !== false));
  const sums = sumQuoteLines(visible, opts.gstRate);
  const ordered = visible
    .map((l, i) => ({ l, i }))
    .sort((a, b) => sectionRank(a.l) - sectionRank(b.l) || a.l.sort_order - b.l.sort_order || a.i - b.i);

  const standard = ordered.filter(({ l }) => l.status === 'included').map(({ l, i }) => toRow(l, i, 'standard'));

  const bySection: SectionGroup[] = [];
  for (const section of SECTION_ORDER) {
    const counted = ordered.filter(({ l }) => l.section === section && countsInTotal(l));
    if (!counted.length) continue;
    // Section subtotal: sumQuoteLines over that section's lines (no renderer arithmetic).
    const s = sumQuoteLines(counted.map(({ l }) => l), opts.gstRate).subtotal;
    bySection.push({ section, title: SECTION_TITLES[section], rows: counted.map(({ l, i }) => toRow(l, i, 'counted')), subtotal: s, subtotalText: formatMoney(s) });
  }

  const notInTotalSet = new Set(sums.notInTotal);
  const notInTotal = ordered.filter(({ l }) => notInTotalSet.has(l)).map(({ l, i }) => toRow(l, i, 'notInTotal'));

  const row = (label: TotalLabel, amount: number) => ({ label, amount, amountText: formatMoney(amount) });
  const totals: LineTotals = {
    upgrades: sums.upgrades, windowCoverings: sums.windowCoverings, subtotal: sums.subtotal, gst: sums.gst, total: sums.total,
    rows: [row('Upgrades', sums.upgrades), row('Window coverings', sums.windowCoverings), row('Subtotal', sums.subtotal), row('GST 5%', sums.gst), row('Total', sums.total)],
  };

  const internalNotes: InternalNote[] = opts.buyerView ? [] : ordered
    .filter(({ l }) => (l.internal_note ?? '').trim())
    .map(({ l }) => ({ location: text(l.location), item: text(l.label), note: (l.internal_note as string).trim() }));

  return { standard, upgrades: { bySection, subtotal: sums.upgrades }, notInTotal, totals, internalNotes };
}
