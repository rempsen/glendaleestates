// Review fix: useSubmissionLineTotals answers zeros while the lines load, so reports / CSV / figures must wait.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gatedFigure, lineTotalsGate, TOTALS_LOADING_TEXT } from '../src/lib/lineTotalsGate';

const root = join(import.meta.dir, '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');

describe('lineTotalsGate', () => {
  test('loading → not ready, placeholder figure; error → not ready, error text, dash; loaded → ready', () => {
    const loading = lineTotalsGate({ loading: true, error: null });
    expect(loading).toEqual({ ready: false, state: 'loading', message: TOTALS_LOADING_TEXT });
    expect(gatedFigure(loading, () => '$0.00')).toBe('…');
    const error = lineTotalsGate({ loading: false, error: 'HTTP 500' });
    expect(error.ready).toBe(false);
    expect(error.message).toContain('HTTP 500');
    expect(error.message).toContain('Exports are disabled');
    expect(gatedFigure(error, () => '$0.00')).toBe('—');
    const ready = lineTotalsGate({ loading: false, error: null });
    expect(ready).toEqual({ ready: true, state: 'ready', message: null });
    expect(gatedFigure(ready, () => '$12.50')).toBe('$12.50');
  });

  test('an error wins over loading (never "loading" forever after a failure)', () => {
    expect(lineTotalsGate({ loading: true, error: 'boom' }).state).toBe('error');
  });
});

describe('useSubmissionLineTotals consumers wait for the lines', () => {
  test('the hook reports loading until the lines match the current submission set (first render included)', () => {
    const hook = read('src/hooks/useSubmissionLineTotals.ts');
    expect(hook).toContain('const stale = state.key !== key;');
    expect(hook).toContain('loading: state.loading || stale,');
  });

  test('every consumer gates through lineTotalsGate', () => {
    for (const f of ['src/pages/AdminReports.tsx', 'src/hooks/useDashboardData.ts', 'src/pages/AdminSalesAnalytics.tsx', 'src/pages/AdminSubmissions.tsx']) {
      expect(`${f}:${read(f).includes('lineTotalsGate(lineTotals)')}`).toBe(`${f}:true`);
    }
  });

  test('AdminReports: all three report / export actions are disabled and guarded until totals are ready', () => {
    const page = read('src/pages/AdminReports.tsx');
    for (const id of ['all-pdf', 'selections-csv', 'quantities']) {
      expect(page).toContain(`disabled={generating === '${id}' || loading || !totalsGate.ready || submissions.length === 0}`);
    }
    for (const fn of ['generateSelectionsSummaryCSV = () => {', 'generateAllSelectionsPDFReport = async () => {', 'generateQuantitiesReport = () => {']) {
      expect(page).toContain(`${fn}\n    if (totalsNotReady()) return;`);
    }
  });

  test('AdminDashboard: the CSV export is disabled and guarded until totals are ready', () => {
    const page = read('src/pages/AdminDashboard.tsx');
    expect(page).toContain('disabled={!totalsGate.ready}');
    expect(page).toContain("if (!totalsGate.ready) { toast.error('Totals are not ready'");
  });
});
