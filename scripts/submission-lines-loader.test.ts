// Fix round 1 (Task 11): the multi-submission quote_lines read must survive PostgREST's silent max-rows cap.
// The fake client caps every response at CAP rows (as Supabase does at 1,000) and honours .range().
import { test, expect, mock } from 'bun:test';

// The browser client needs Vite env; the loader takes an injected client, so stub the module.
mock.module('@/integrations/supabase/client', () => ({ supabase: { from: () => { throw new Error('use the injected client'); } } }));
const { fetchStoredLines, loadLinesForSubmissions, ID_CHUNK } = await import('../src/lib/submissionLinesLoader');

const CAP = 7;
const SUBS = 130; // > 2 id chunks
const LINES_PER_SUB = 3;
const all = Array.from({ length: SUBS }, (_, s) => Array.from({ length: LINES_PER_SUB }, (_, k) => ({
  id: `l-${String(s).padStart(3, '0')}-${k}`, submission_id: `s-${String(s).padStart(3, '0')}`, sort_order: k + 1,
  section: 'other', location: 'Kitchen', label: `Line ${k}`, unit: 'flat', pricing_mode: 'manual', status: 'upgrade',
  client_visible: true, source: 'migration', provisional: false, amount: 10 * (k + 1),
}))).flat();

function cappedClient(calls: { inSizes: number[]; ranges: Array<[number, number]> }) {
  return {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      let ids: string[] | null = null;
      let range: [number, number] | null = null;
      const run = () => {
        let rows: unknown[] = table === 'quote_lines' ? all.filter((r) => !ids || ids.includes(r.submission_id))
          : table === 'pricing_config' ? [{ config_key: 'gst_rate', config_value: 5, is_active: true }] : [];
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: rows.slice(0, CAP), error: null }); // the silent cap
      };
      Object.assign(q, {
        select: () => q, eq: () => q, order: () => q,
        in: (_c: string, v: string[]) => { ids = v; calls.inSizes.push(v.length); return q; },
        range: (a: number, b: number) => { range = [a, b]; calls.ranges.push([a, b]); return run(); },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
      });
      return q;
    },
  };
}

test('paged read returns every stored line despite the cap; ids chunked', async () => {
  const calls = { inSizes: [] as number[], ranges: [] as Array<[number, number]> };
  const rows = await fetchStoredLines(cappedClient(calls), all.map((r) => r.submission_id).filter((v, i, a) => a.indexOf(v) === i), CAP);
  expect(rows.length).toBe(SUBS * LINES_PER_SUB);
  expect(new Set(rows.map((r) => r.id)).size).toBe(all.length);
  expect(Math.max(...calls.inSizes)).toBeLessThanOrEqual(ID_CHUNK);
  expect(calls.ranges.length).toBeGreaterThan(Math.ceil(SUBS / ID_CHUNK));
});

test('loadLinesForSubmissions: every unit gets its stored lines (none fall back to generated)', async () => {
  const subs = Array.from({ length: SUBS }, (_, s) => ({ id: `s-${String(s).padStart(3, '0')}`, unit_type: 'Unit Type C' }));
  const batch = await loadLinesForSubmissions(subs, { client: cappedClient({ inSizes: [], ranges: [] }), pageRows: CAP });
  for (const s of subs) {
    expect(batch.linesSourceBySubmission[s.id]).toBe('db');
    expect(batch.linesBySubmission[s.id].length).toBe(LINES_PER_SUB);
  }
});

test('a single unpaged request would have been truncated (the bug this guards)', async () => {
  const r = await cappedClient({ inSizes: [], ranges: [] }).from('quote_lines').select('*').in('submission_id', all.map((x) => x.submission_id));
  expect((r as { data: unknown[] }).data.length).toBe(CAP);
});

test('loader: an un-itemised submission with one office pending line is mixed (generated + pending), never smaller', async () => {
  const { sumQuoteLines } = await import('../supabase/functions/_shared/quoteLines.ts');
  const { savedSubmissionLines, quotePricingFromRows } = await import('../src/lib/generateInputFromSelections');
  const sub = { id: 'u-1', unit_type: 'Unit Type C', unit_number: '1' };
  const pending = { id: 'p-1', submission_id: 'u-1', sort_order: 1, section: 'other', location: 'Kitchen', label: 'Pending',
    unit: 'flat', pricing_mode: 'manual', status: 'pending', client_visible: true, source: 'office', provisional: false, amount: null };
  const client = { from: (table: string) => {
    const q: Record<string, unknown> = {};
    const run = () => Promise.resolve({ data: table === 'quote_lines' ? [pending] : [], error: null });
    Object.assign(q, { select: () => q, eq: () => q, order: () => q, in: () => q, range: () => run(),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej) });
    return q;
  } };
  const batch = await loadLinesForSubmissions([sub], { client, pageRows: CAP });
  expect(batch.linesSourceBySubmission['u-1']).toBe('mixed');
  const lines = batch.linesBySubmission['u-1'];
  expect(lines.some((l) => l.id === 'p-1')).toBe(true);
  // The fake client returns no pricing rows, so the loader's pricing is the empty-table pricing.
  const gen = savedSubmissionLines([], sub, quotePricingFromRows({ config: [], materials: [], unitAreas: [] })).lines;
  expect(sumQuoteLines(lines, batch.gstRate).total.toFixed(2)).toBe(sumQuoteLines(gen, batch.gstRate).total.toFixed(2));
  expect(lines.length).toBe(gen.length + 1);
});
