// Quote-line tables for every email (Phase 2 Task 11, spec §6.11): send-selections-email (buyer + office),
// resend-confirmation-email (buyer + admin) and the admin preview fallback (src/lib/emailPreview.ts). Pure: lines in,
// HTML/CSV out. Rows and totals come from buildLineRows (sumQuoteLines inside) — no arithmetic here.
// Columns: location · item · product/colour · qty · unit price · amount · status. Sections: Standard selections /
// Premium upgrades (by section) / Not included in total. `Pending` never prints as $0.00.
// The buyer copy prints client-visible lines and client notes only; internal notes print on the staff copy, after
// everything else. With prices unavailable (pricing tables failed to load at submit) no money is printed at all and
// the email says the itemised quote will follow.
import { buildLineRows, CountedHiddenLineError, INTERNAL_NOTES_HEADING, LINE_COLUMNS, type LineRenderModel, type LineRow } from './lineRenderRows.ts';
import { GENERATED_LINES_NOTE } from './savedSubmissionLines.ts';
import { EMAIL_THEME, styles } from './emailTheme.ts';
import type { QuoteLine } from './quoteLines.ts';

export const QUOTE_TO_FOLLOW_TEXT = 'Your itemised quote will follow — our team will confirm pricing for these selections.';
export const STAFF_PRICES_UNAVAILABLE_TEXT = 'Pricing was unavailable when this was sent: no prices are shown. The lines will be priced by the backfill or in the console.';
/** Columns printed when no prices may be shown (unit price and amount dropped). */
export const NO_PRICE_COLUMNS = LINE_COLUMNS.filter((c) => c !== 'Unit price' && c !== 'Amount');

/** The lines an email prints, and whether their prices may be shown. */
export interface EmailLines {
  lines: QuoteLine[];
  gstRate: number;
  /** False when pricing was unavailable at submit: print no money, say the itemised quote will follow. */
  pricesAvailable: boolean;
  linesSource?: 'db' | 'generated';
}

export interface LinesEmailOptions {
  buyerView: boolean;
  gstRate: number;
  /** False when the lines were generated without prices (pricing unavailable): print no money at all. */
  pricesAvailable: boolean;
  /** Stored lines ('db') or generator fallback ('generated'); the staff copy notes a fallback. */
  linesSource?: 'db' | 'generated';
}

export interface LinesEmailResult {
  html: string;
  /** Null when no prices were printed. */
  totals: LineRenderModel['totals'] | null;
  model: LineRenderModel | null;
}

export function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const c = EMAIL_THEME.colors;
const th = (label: string, right = false) => `<th style="${styles.th}${right ? ' text-align:right;' : ''}">${escapeHtml(label)}</th>`;
const td = (v: string, right = false) => `<td style="${right ? styles.tdRight : styles.td}">${v}</td>`;

function rowHtml(r: LineRow, withPrices: boolean): string {
  const item = `${escapeHtml(r.item)}${r.clientNote ? `<div style="color:${c.textMuted}; font-size:12px; margin-top:2px; font-style:italic;">${escapeHtml(r.clientNote)}</div>` : ''}`;
  const cells = [td(escapeHtml(r.location)), td(item), td(escapeHtml(r.product)), td(escapeHtml(r.qty))];
  if (withPrices) cells.push(td(escapeHtml(r.unitPrice), true), td(escapeHtml(r.amount), true));
  cells.push(td(escapeHtml(r.status)));
  return `<tr>${cells.join('')}</tr>`;
}

function tableHtml(rows: LineRow[], withPrices: boolean, subtotal?: { label: string; text: string }): string {
  const cols = withPrices ? LINE_COLUMNS : NO_PRICE_COLUMNS;
  const header = `<tr style="background:${c.surfaceAlt};">${cols.map((h) => th(h, h === 'Unit price' || h === 'Amount')).join('')}</tr>`;
  const foot = subtotal && withPrices
    ? `<tr><td colspan="5" style="${styles.td} font-weight:600;">${escapeHtml(subtotal.label)}</td><td style="${styles.tdRight} font-weight:700;">${escapeHtml(subtotal.text)}</td><td style="${styles.td}"></td></tr>`
    : '';
  return `<table role="presentation" style="${styles.table} margin:0 0 16px;">${header}${rows.map((r) => rowHtml(r, withPrices)).join('')}${foot}</table>`;
}

const h2 = (t: string) => `<h2 style="${styles.h2} margin-top:24px;">${escapeHtml(t)}</h2>`;
const h3 = (t: string) => `<h3 style="margin:12px 0 6px; color:${c.heading}; font-size:15px; font-weight:600;">${escapeHtml(t)}</h3>`;
const note = (t: string) => `<p style="${styles.textMuted}">${escapeHtml(t)}</p>`;

function noPriceModel(lines: QuoteLine[], opts: LinesEmailOptions): LineRenderModel {
  // Hidden lines are never printed for the buyer, counted or not, when prices are withheld.
  const shown = opts.buyerView ? lines.filter((l) => l.client_visible !== false) : lines;
  return buildLineRows(shown, { buyerView: false, gstRate: opts.gstRate });
}

/** The full lines block (all three sections, totals, staff notes) for one email. */
export function renderLinesEmailHtml(lines: QuoteLine[], opts: LinesEmailOptions): LinesEmailResult {
  let withPrices = opts.pricesAvailable;
  let model: LineRenderModel;
  try {
    model = withPrices ? buildLineRows(lines, { buyerView: opts.buyerView, gstRate: opts.gstRate }) : noPriceModel(lines, opts);
  } catch (err) {
    if (!(err instanceof CountedHiddenLineError)) throw err;
    // Never shrink the buyer's total by dropping a counted line: send no prices and let the office follow up.
    console.error(`[email] ${err.message}; buyer email sent without prices`);
    withPrices = false;
    model = noPriceModel(lines, opts);
  }

  const parts: string[] = [];
  if (!withPrices) {
    parts.push(`<div style="${styles.sectionWarning}"><p style="${styles.text} margin:0;"><strong>${escapeHtml(opts.buyerView ? QUOTE_TO_FOLLOW_TEXT : STAFF_PRICES_UNAVAILABLE_TEXT)}</strong></p></div>`);
  }
  if (model.standard.length) {
    parts.push(h2('Standard selections (included)'), tableHtml(model.standard, withPrices));
  }
  // Premium upgrades: priced lines by section. Without prices the counted lines still list (status Upgrade).
  if (model.upgrades.bySection.length) {
    parts.push(h2('Premium upgrades'));
    for (const s of model.upgrades.bySection) {
      parts.push(h3(s.title), tableHtml(s.rows, withPrices, { label: `${s.title} subtotal`, text: s.subtotalText }));
    }
  }
  if (model.notInTotal.length) {
    parts.push(h2('Not included in total'), tableHtml(model.notInTotal, withPrices));
  }
  if (withPrices) {
    const totalRows = model.totals.rows.map((r) => {
      const big = r.label === 'Total';
      const label = big ? 'Total (incl. GST)' : r.label;
      return `<tr><td style="${big ? styles.grandTotalLabel : styles.td}">${escapeHtml(label)}</td><td style="${big ? styles.grandTotalValue : styles.tdRight}">${escapeHtml(r.amountText)}</td></tr>`;
    }).join('');
    parts.push(h2('Totals'), `<table role="presentation" style="${styles.table}">${totalRows}</table>`,
      note('A 10% material overage is allowed on all quoted amounts.'));
  }
  if (!opts.buyerView) {
    if (opts.linesSource === 'generated') parts.push(note(GENERATED_LINES_NOTE));
    if (model.internalNotes.length) {
      parts.push(`<div style="${styles.sectionWarning}">${h3(INTERNAL_NOTES_HEADING)}<ul style="margin:0; padding-left:18px;">${model.internalNotes
        .map((n) => `<li style="${styles.text}"><strong>${escapeHtml([n.location, n.item].filter(Boolean).join(' — '))}:</strong> ${escapeHtml(n.note)}</li>`).join('')}</ul></div>`);
    }
  }
  return { html: parts.join('\n'), totals: withPrices ? model.totals : null, model };
}

/** CSV rows for the office attachment: one row per line (standard, counted, not in total) plus the totals. */
export function linesCsvRows(lines: QuoteLine[], opts: { gstRate: number; pricesAvailable: boolean }): string[][] {
  const m = buildLineRows(lines, { buyerView: false, gstRate: opts.gstRate });
  const out: string[][] = [['Section', ...LINE_COLUMNS]];
  const blank = (r: LineRow) => (opts.pricesAvailable ? [r.unitPrice, r.amount] : ['', '']);
  const push = (section: string, r: LineRow) => out.push([section, r.location, r.clientNote ? `${r.item} (${r.clientNote})` : r.item, r.product, r.qty, ...blank(r), r.status]);
  m.standard.forEach((r) => push('Standard', r));
  m.upgrades.bySection.forEach((s) => s.rows.forEach((r) => push(s.title, r)));
  m.notInTotal.forEach((r) => push('Not included in total', r));
  if (opts.pricesAvailable) for (const t of m.totals.rows) out.push(['Totals', '', t.label, '', '', '', t.amountText, '']);
  else out.push(['Totals', '', 'Pricing unavailable — itemised quote to follow', '', '', '', '', '']);
  return out;
}
