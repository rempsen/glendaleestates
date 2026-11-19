// Totals per saved submission from quote lines (Phase 2 Task 18; replaces the engine-based useWindowSubtotal).
// Lines come from loadLinesForSubmissions (stored quote_lines win; otherwise the generator over the row at live
// prices), and every figure from sumQuoteLines — never from the submit-time window total column on buyer_selections.
import { useEffect, useMemo, useState } from 'react';
import { sumQuoteLines, type QuoteLine } from '@/lib/quoteLines';
import { loadLinesForSubmissions } from '@/lib/submissionLinesLoader';

export type LineTotals = ReturnType<typeof sumQuoteLines>;

export interface SubmissionLineTotals {
  loading: boolean;
  error: string | null;
  gstRate: number;
  linesOf: (id: string) => QuoteLine[];
  /** sumQuoteLines over the submission's lines; all zeros until loaded. */
  totalsOf: (id: string) => LineTotals;
  /** sumQuoteLines over one section's lines only (e.g. 'window_coverings'). */
  sectionTotalsOf: (id: string, section: QuoteLine['section']) => LineTotals;
}

const EMPTY: QuoteLine[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSubmissionLineTotals(submissions: ReadonlyArray<Record<string, any> & { id: string }>): SubmissionLineTotals {
  const [state, setState] = useState<{ lines: Record<string, QuoteLine[]>; gstRate: number; loading: boolean; error: string | null }>(
    { lines: {}, gstRate: 0, loading: false, error: null },
  );
  // Reload when the set of submissions or any of their edits changes.
  const key = submissions.map((s) => `${s.id}:${s.updated_at ?? ''}`).join('|');
  useEffect(() => {
    if (submissions.length === 0) { setState({ lines: {}, gstRate: 0, loading: false, error: null }); return; }
    let cancelled = false;
    setState((p) => ({ ...p, loading: true, error: null }));
    loadLinesForSubmissions([...submissions])
      .then((r) => { if (!cancelled) setState({ lines: r.linesBySubmission, gstRate: r.gstRate, loading: false, error: null }); })
      .catch((e) => { if (!cancelled) setState((p) => ({ ...p, loading: false, error: e instanceof Error ? e.message : String(e) })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return useMemo(() => {
    const linesOf = (id: string) => state.lines[id] ?? EMPTY;
    return {
      loading: state.loading,
      error: state.error,
      gstRate: state.gstRate,
      linesOf,
      totalsOf: (id: string) => sumQuoteLines(linesOf(id), state.gstRate),
      sectionTotalsOf: (id: string, section: QuoteLine['section']) =>
        sumQuoteLines(linesOf(id).filter((l) => l.section === section), state.gstRate),
    };
  }, [state]);
}
