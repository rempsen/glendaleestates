// Quote lines for many submissions at once (Phase 2 Task 11): the export page and the project-management hub.
// Same rule as loadSavedSubmissionContext: stored `quote_lines` win (removed dropped); a submission with none falls
// back to the generator over its row at live prices (active pricing rows only).
import { supabase } from '@/integrations/supabase/client';
import type { QuoteLine } from '@/lib/quoteLines';
import { quotePricingFromRows, savedSubmissionLines, type StoredQuoteLineRow } from '@/lib/generateInputFromSelections';

const CHUNK = 200;

export interface SubmissionLinesBatch {
  linesBySubmission: Record<string, QuoteLine[]>;
  linesSourceBySubmission: Record<string, 'db' | 'generated'>;
  gstRate: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLinesForSubmissions(submissions: Array<Record<string, any> & { id: string }>): Promise<SubmissionLinesBatch> {
  const ids = submissions.map((s) => s.id);
  const [configs, materials, areas, ...chunks] = await Promise.all([
    supabase.from('pricing_config').select('*').eq('is_active', true),
    supabase.from('upgrade_materials').select('*').eq('is_active', true),
    supabase.from('unit_area_data').select('*'),
    ...Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) =>
      supabase.from('quote_lines').select('*').in('submission_id', ids.slice(i * CHUNK, (i + 1) * CHUNK)).order('sort_order', { ascending: true })),
  ]);
  for (const r of [configs, materials, areas, ...chunks]) if (r.error) throw r.error;
  const pricing = quotePricingFromRows({ config: configs.data, materials: materials.data, unitAreas: areas.data });

  const stored = new Map<string, StoredQuoteLineRow[]>();
  for (const c of chunks) {
    for (const row of (c.data ?? []) as unknown as Array<StoredQuoteLineRow & { submission_id: string }>) {
      if (!stored.has(row.submission_id)) stored.set(row.submission_id, []);
      stored.get(row.submission_id)!.push(row);
    }
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
