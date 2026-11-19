// QuickBooks Online estimate lines from quote_lines (Phase 2 Task 15, spec §6.11 / line 35). Pure: lines in, estimate
// lines and totals out. No price arithmetic of its own: Amount is the line amount and subtotal/GST/total come from
// sumQuoteLines (the same function as the console rail, PDF, Word, email and HubSpot), so QBO cannot disagree.
// Only relative imports of import-free modules (Deno + bun + Vite). Tested by scripts/qbo-lines-map.test.ts.
//
// Rules: one SalesItemLine per counted line (countsInTotal); included / deferred / removed lines are not sent; any
// pending or under_review line, or an upgrade with no amount, blocks the sync (the function answers 409).
// SKU = {prefix}{SECTION}-{material_key | slug(label)}, prefix default "GLEN-". Descriptions are buyer-safe
// (location · label · product/colour, then client_note) and never carry internal_note.
import { countsInTotal, sumQuoteLines, type QuoteLine } from './quoteLines.ts';
import { toBuyerWording } from './buyerWording.ts';

export const QBO_SKU_PREFIX = 'GLEN-';
export const QBO_UNPRICED_REASON = 'quote has unpriced lines';
/** QBO SalesItemLine Description limit. */
const DESCRIPTION_MAX = 4000;
const SLUG_MAX = 40;

export interface QboEstimateLine {
  /** quote_lines.id (null for generated lines that were never stored). */
  lineId: string | null;
  section: QuoteLine['section'];
  /** Item Sku; also the Item Name when the function creates the Item. */
  sku: string;
  Description: string;
  Amount: number;
  Qty: number;
  UnitPrice: number;
}

export interface QboEstimateMap {
  lines: QboEstimateLine[];
  subtotal: number;
  gst: number;
  total: number;
  blocked?: { reason: string; lineIds: string[] };
}

/** Lowercase a–z0–9 joined by "-", at most 40 characters; "item" when nothing is left. */
export function qboSlug(s: string): string {
  const slug = String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX).replace(/-+$/g, '');
  return slug || 'item';
}

export function qboSku(line: Pick<QuoteLine, 'section' | 'material_key' | 'label'>, prefix: string = QBO_SKU_PREFIX): string {
  const key = (line.material_key ?? '').trim();
  return `${prefix}${String(line.section).toUpperCase()}-${key || qboSlug(line.label)}`;
}

const clean = (s: string | null | undefined) => toBuyerWording((s ?? '').trim());
const toCents = (n: number) => Math.round(n * 100) / 100;

/** Buyer-safe description: location · label · product — colour, then the client note. Never internal_note. */
export function qboDescription(l: QuoteLine): string {
  const product = [clean(l.product_name), clean(l.product_colour)].filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i).join(' — ');
  const head = [clean(l.location), clean(l.label), product].filter(Boolean).join(' · ');
  return [head, clean(l.client_note)].filter(Boolean).join(' — ').slice(0, DESCRIPTION_MAX);
}

const isUnpriced = (l: QuoteLine) =>
  l.status === 'pending' || l.status === 'under_review' || (l.status === 'upgrade' && l.amount == null);

export function estimateLinesFromQuoteLines(
  lines: QuoteLine[], opts: { gstRate: number; skuPrefix?: string },
): QboEstimateMap {
  const live = lines.filter((l) => l.status !== 'removed');
  const sum = sumQuoteLines(live, opts.gstRate);
  const unpriced = live.filter(isUnpriced).map((l) => l.id ?? `sort:${l.sort_order}`);
  const out: QboEstimateLine[] = live.filter(countsInTotal).map((l) => {
    const amount = toCents(l.amount as number);
    const q = Number(l.quantity);
    let Qty = 1; let UnitPrice = amount;
    if (Number.isFinite(q) && q > 0) {
      const unit = toCents(amount / q);
      if (Math.abs(unit * q - amount) < 1e-6) { Qty = q; UnitPrice = unit; }
    }
    return {
      lineId: l.id ?? null, section: l.section, sku: qboSku(l, opts.skuPrefix ?? QBO_SKU_PREFIX),
      Description: qboDescription(l), Amount: amount, Qty, UnitPrice,
    };
  });
  const result: QboEstimateMap = { lines: out, subtotal: sum.subtotal, gst: sum.gst, total: sum.total };
  if (unpriced.length > 0) result.blocked = { reason: QBO_UNPRICED_REASON, lineIds: unpriced };
  return result;
}
