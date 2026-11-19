// Quote lines for many submissions at once (Phase 2 Task 11): the export page and the project-management hub.
// Same rule as loadSavedSubmissionContext: stored `quote_lines` win (removed dropped); a submission with none falls
// back to the generator over its row at live prices (active pricing rows only).
//
// PostgREST caps every response at `max-rows` (1,000 on Supabase) without an error, so the read is chunked by
// submission id AND paged by rows with `.range()` until a short page comes back. A truncated read would print partial
// quotes, or generated lines in place of what staff saved.
import { supabase } from '@/integrations/supabase/client';
import type { QuoteLine } from '@/lib/quoteLines';
import { quotePricingFromRows, savedSubmissionLines, type StoredQuoteLineRow } from '@/lib/generateInputFromSelections';

/** Submission ids per `in(...)` filter (keeps URLs short). */
export const ID_CHUNK = 50;
/** Rows per page; must not exceed the server's max-rows (Supabase default 1,000). */
export const PAGE_ROWS = 1000;

export interface SubmissionLinesBatch {
  linesBySubmission: Record<string, QuoteLine[]>;
  linesSourceBySubmission: Record<string, 'db' | 'generated'>;
  gstRate: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };
type StoredRow = StoredQuoteLineRow & { submission_id: string };

/** Every stored line for these ids, paged so no row is lost to the response cap. */
export async function fetchStoredLines(client: Client, ids: string[], pageRows = PAGE_ROWS): Promise<StoredRow[]> {
  const chunks = Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));
  const perChunk = await Promise.all(chunks.map(async (chunk) => {
    const out: StoredRow[] = [];
    for (let from = 0; ; from += pageRows) {
      // Stable order across pages: submission, sort_order, then id.
      const { data, error } = await client.from('quote_lines').select('*').in('submission_id', chunk)
        .order('submission_id', { ascending: true }).order('sort_order', { ascending: true }).order('id', { ascending: true })
        .range(from, from + pageRows - 1);
      if (error) throw error;
      const page = (data ?? []) as StoredRow[];
      out.push(...page);
      if (page.length < pageRows) break;
    }
    return out;
  }));
  return perChunk.flat();
}

export async function loadLinesForSubmissions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submissions: Array<Record<string, any> & { id: string }>,
  opts: { client?: Client; pageRows?: number } = {},
): Promise<SubmissionLinesBatch> {
  const client = opts.client ?? supabase;
  const ids = submissions.map((s) => s.id);
  const [configs, materials, areas, storedRows] = await Promise.all([
    client.from('pricing_config').select('*').eq('is_active', true),
    client.from('upgrade_materials').select('*').eq('is_active', true),
    client.from('unit_area_data').select('*'),
    fetchStoredLines(client, ids, opts.pageRows),
  ]);
  for (const r of [configs, materials, areas]) if (r.error) throw r.error;
  const pricing = quotePricingFromRows({ config: configs.data, materials: materials.data, unitAreas: areas.data });

  const stored = new Map<string, StoredQuoteLineRow[]>();
  for (const row of storedRows) {
    if (!stored.has(row.submission_id)) stored.set(row.submission_id, []);
    stored.get(row.submission_id)!.push(row);
  }
  const linesBySubmission: Record<string, QuoteLine[]> = {};
  const linesSourceBySubmission: Record<string, 'db' | 'generated'> = {};
  for (const s of submissions) {
    const { lines, linesSource } = savedSubmissionLines(stored.get(s.id), s, pricing);
    linesBySubmission[s.id] = lines;
    linesSourceBySubmission[s.id] = linesSource;
  }
  return { linesBySubmission, linesSourceBySubmission, gstRate: pricing.gstRate };
}
