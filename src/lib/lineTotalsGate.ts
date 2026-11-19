// Gate for figures from useSubmissionLineTotals (review fix: $0.00 exports while lines load). The hook answers all
// zeros until the lines arrive, so a report / CSV / figure taken in that window is silently wrong. Every consumer
// (AdminReports, AdminDashboard via useDashboardData, AdminSalesAnalytics, AdminSubmissions) asks this gate first:
// actions stay disabled and figures show a placeholder until `ready`; on an error nothing is exported.
export type LineTotalsGateState = 'loading' | 'error' | 'ready';

export interface LineTotalsGate {
  ready: boolean;
  state: LineTotalsGateState;
  /** Text to show beside a disabled action or in place of the figures; null when ready. */
  message: string | null;
}

export const TOTALS_LOADING_TEXT = 'Loading totals from quote lines…';
export const totalsErrorText = (error: string) =>
  `Totals could not be loaded (${error}). Exports are disabled until they load; refresh to retry.`;

export function lineTotalsGate(t: { loading: boolean; error: string | null }): LineTotalsGate {
  if (t.error) return { ready: false, state: 'error', message: totalsErrorText(t.error) };
  if (t.loading) return { ready: false, state: 'loading', message: TOTALS_LOADING_TEXT };
  return { ready: true, state: 'ready', message: null };
}

/** A money figure, or a placeholder ('…' loading, '—' error) so a not-yet-loaded zero is never shown as $0. */
export function gatedFigure(gate: LineTotalsGate, format: () => string): string {
  if (gate.state === 'loading') return '…';
  if (gate.state === 'error') return '—';
  return format();
}
