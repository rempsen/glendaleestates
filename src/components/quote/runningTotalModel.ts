// RunningTotal view model (Phase 2 Task 4, spec §6.16). Pure: lines in, display model out.
// No arithmetic here: every sum comes from sumQuoteLines, so the rail, PDF and exports share one function.
import { sumQuoteLines, countsInTotal, gstLabel, SECTION_ORDER, type QuoteLine, type LineStatus } from '@/lib/quoteLines';

export type RowLabel = 'Upgrades' | 'Window coverings' | 'Subtotal' | `GST ${string}%` | 'Total';

export interface CountedEntry { key: string; location: string; label: string; amount: number; amountText: string }
export interface NotInTotalEntry { key: string; location: string; label: string; amountText: string; statusLabel: string }
export interface TotalRow { label: RowLabel; amount: number; amountText: string }
export interface RunningTotalModel { counted: CountedEntry[]; notInTotal: NotInTotalEntry[]; rows: TotalRow[] }

// One money formatter and one "Pending" word for the rail, the documents and the emails.
import { formatMoney, PENDING_TEXT } from '@shared/lineRenderRows';
export { formatMoney, PENDING_TEXT };

const STATUS_LABEL: Partial<Record<LineStatus, string>> = {
  pending: 'Pending', under_review: 'Under review', deferred: 'Deferred', upgrade: 'Pending',
};

const keyOf = (l: QuoteLine, i: number) => l.id ?? `${l.sort_order}-${l.section}-${l.location}-${l.label}-${i}`;
const sectionRank = (l: QuoteLine) => SECTION_ORDER.indexOf(l.section);

export function buildRunningTotalModel(lines: QuoteLine[], gstRate: number, opts: { buyerView: boolean }): RunningTotalModel {
  const visible = lines.filter((l) => l.status !== 'removed' && (!opts.buyerView || l.client_visible !== false));
  const sums = sumQuoteLines(visible, gstRate);
  const ordered = visible
    .map((l, i) => ({ l, i }))
    .sort((a, b) => sectionRank(a.l) - sectionRank(b.l) || a.l.sort_order - b.l.sort_order || a.i - b.i);

  const counted: CountedEntry[] = ordered
    .filter(({ l }) => countsInTotal(l))
    .map(({ l, i }) => ({ key: keyOf(l, i), location: l.location, label: l.label, amount: l.amount as number, amountText: formatMoney(l.amount as number) }));

  const notInTotalSet = new Set(sums.notInTotal);
  const notInTotal: NotInTotalEntry[] = ordered
    .filter(({ l }) => notInTotalSet.has(l))
    .map(({ l, i }) => ({
      key: keyOf(l, i), location: l.location, label: l.label,
      amountText: l.amount == null ? PENDING_TEXT : formatMoney(l.amount),
      statusLabel: STATUS_LABEL[l.status] ?? l.status,
    }));

  const row = (label: RowLabel, amount: number): TotalRow => ({ label, amount, amountText: formatMoney(amount) });
  return {
    counted,
    notInTotal,
    rows: [
      row('Upgrades', sums.upgrades), row('Window coverings', sums.windowCoverings),
      row('Subtotal', sums.subtotal), row(gstLabel(gstRate), sums.gst), row('Total', sums.total),
    ],
  };
}
