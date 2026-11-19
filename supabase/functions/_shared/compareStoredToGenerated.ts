// Stored `quote_lines` ↔ freshly generated lines for the same submission: the drift detector run by
// audit-pricing-consistency after the backfill (Phase 2 Task 18). Totals come only from `sumQuoteLines`.
// Imports only ./quoteLines.ts so it runs under Deno, the browser and bun alike.
//
// A diff is expected wherever staff edited a line in the console after it was stored (the stored line is then the
// record and the generator no longer describes it); right after the backfill every unit must show 0.
import { countsInTotal, sumQuoteLines, type QuoteLine } from './quoteLines.ts';

/** Only these columns are read; amounts may arrive as numeric strings from PostgREST. */
export type ComparableLine = Pick<QuoteLine, 'section' | 'status'> & { amount?: number | string | null };

export interface LinesComparison {
  generated_subtotal: number;
  stored_subtotal: number;
  /** stored − generated, rounded to the cent. */
  diff: number;
  windows_generated: number;
  windows_stored: number;
  windows_diff: number;
  /** Stored lines, including included / removed. */
  line_count: number;
  /** Stored lines that count in the total. */
  counted_lines: number;
  /** Stored lines not counted, not included, not removed (pending, deferred, under_review, unpriced upgrade). */
  not_in_total: number;
  ok: boolean;
}

/** Half a cent: anything below is float noise; one cent or more is a real difference. */
const TOLERANCE = 0.005;
const cents = (n: number) => Math.round(n * 100) / 100;

function normalise(lines: ComparableLine[]): QuoteLine[] {
  return lines.map((l) => ({
    section: l.section, status: l.status,
    amount: l.amount == null || l.amount === '' ? null : Number(l.amount),
  }) as QuoteLine);
}

export function compareStoredToGenerated(stored: ComparableLine[], generated: ComparableLine[]): LinesComparison {
  const s = normalise(stored);
  const g = normalise(generated);
  const st = sumQuoteLines(s, 0);
  const gt = sumQuoteLines(g, 0);
  const counted = s.filter((l) => l.status !== 'removed' && countsInTotal(l)).length;
  const diff = st.subtotal - gt.subtotal;
  const windowsDiff = st.windowCoverings - gt.windowCoverings;
  return {
    generated_subtotal: cents(gt.subtotal),
    stored_subtotal: cents(st.subtotal),
    diff: cents(diff),
    windows_generated: cents(gt.windowCoverings),
    windows_stored: cents(st.windowCoverings),
    windows_diff: cents(windowsDiff),
    line_count: stored.length,
    counted_lines: counted,
    not_in_total: st.notInTotal.length,
    ok: Number.isFinite(st.subtotal) && Number.isFinite(gt.subtotal)
      && Math.abs(diff) < TOLERANCE && Math.abs(windowsDiff) < TOLERANCE,
  };
}
