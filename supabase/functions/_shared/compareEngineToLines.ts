// Engine totals ↔ stored/generated quote lines, for the parity harness (audit-pricing-consistency mode 'lines')
// and the quote_lines backfill. Imports only ./quoteLines.ts so it runs under Deno, the browser and bun alike.
import { countsInTotal, type QuoteLine } from './quoteLines.ts';

export interface EngineTotalsLike { grandSubtotal: number; windowSubtotal: number }
/** Only these columns are read; amounts may arrive as numeric strings from PostgREST. */
export type ComparableLine = Pick<QuoteLine, 'section' | 'status'> & { amount?: number | string | null };

export interface LinesComparison {
  engine_subtotal: number;
  lines_subtotal: number;
  /** lines − engine, rounded to the cent. */
  diff: number;
  windows_engine: number;
  windows_lines: number;
  windows_diff: number;
  /** All lines, including included / removed. */
  line_count: number;
  counted_lines: number;
  /** Not counted, not included, not removed (pending, deferred, under_review, unpriced upgrade). */
  not_in_total: number;
  ok: boolean;
}

/** Half a cent: anything below is float noise; one cent or more is a real difference. */
const TOLERANCE = 0.005;
const cents = (n: number) => Math.round(n * 100) / 100;

export function compareEngineToLines(engine: EngineTotalsLike, lines: ComparableLine[]): LinesComparison {
  let subtotal = 0; let windows = 0; let counted = 0; let notInTotal = 0;
  for (const l of lines) {
    if (l.status === 'removed') continue;
    const amount = l.amount == null || l.amount === '' ? null : Number(l.amount);
    if (countsInTotal({ status: l.status, amount })) {
      counted++;
      subtotal += amount as number;
      if (l.section === 'window_coverings') windows += amount as number;
    } else if (l.status !== 'included') notInTotal++;
  }
  const engineSubtotal = Number(engine.grandSubtotal) || 0;
  const engineWindows = Number(engine.windowSubtotal) || 0;
  const rawDiff = subtotal - engineSubtotal;
  const rawWindowsDiff = windows - engineWindows;
  return {
    engine_subtotal: cents(engineSubtotal),
    lines_subtotal: cents(subtotal),
    diff: cents(rawDiff),
    windows_engine: cents(engineWindows),
    windows_lines: cents(windows),
    windows_diff: cents(rawWindowsDiff),
    line_count: lines.length,
    counted_lines: counted,
    not_in_total: notInTotal,
    ok: Number.isFinite(subtotal) && Math.abs(rawDiff) < TOLERANCE && Math.abs(rawWindowsDiff) < TOLERANCE,
  };
}
