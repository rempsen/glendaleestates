// "Itemise this quote" (final fix wave C1): a submission with no stored wizard / migration lines is not itemised —
// every renderer shows its generated quote (plus any office / buyer-request lines, `mixed`), but the console edits
// stored lines only. Staff itemise first: the generated lines are inserted as source='migration' (the backfill's
// mapping: buildGenerateInputFromRow over the row at live prices) in ONE insert statement (atomic; the audit trigger
// still logs each row; forbidden keys stripped by cleanPatch; the counted-hidden CHECK is the DB's). Until then the
// console locks Add line, status edits, Send for signature and Documents.
//
// Race (two staff, or a stale tab): (a) just before inserting, quote_lines is re-read for any wizard / migration line
// and the insert is skipped ("already"); (b) the set's first line has sort_order 1 (deterministic, 1..N), and 0016's
// partial unique index quote_lines_one_migration_set (submission_id) WHERE source = 'migration' AND sort_order = 1
// rejects a concurrent second set — the whole batch fails with 23505, treated as "already". Nothing else writes
// sort_order 1 (new lines and reorders use multiples of 10), so reordering is unaffected.
import { generateQuoteLines, type QuoteLine } from '@/lib/quoteLines';
import { buildGenerateInputFromRow, quotePricingFromRows } from '@/lib/generateInputFromSelections';
import { isItemised } from '@shared/savedSubmissionLines';
import type { BuyerSelectionsRowLike } from '@shared/quoteSelectionsFromRow';
import type { QuotePricing } from '@/lib/quoteLines';
import type { NewLineInput } from '@/hooks/useQuoteLines';
import { cleanPatch } from '@/lib/quoteLinesReducer';

export const ITEMISE_BANNER_TITLE = 'This quote has not been itemised yet';
export const ITEMISE_BANNER_TEXT = 'Buyers, PDFs and emails see the quote generated from the selections. Itemise it to '
  + 'edit lines, change statuses, add lines or send documents.';
export const ITEMISE_LOCKED_REASON = 'Itemise this quote first';
export const ALREADY_ITEMISED_TEXT = 'Already itemised — reloading';
/** The first line of an itemised set; 0016's partial unique index allows one per submission. */
export const ITEMISE_SENTINEL_SORT_ORDER = 1;

export interface ItemiseState {
  /** Show the banner: lines loaded, no stored wizard / migration line. */
  needsItemising: boolean;
  /** Add line, status edits, Send for signature and Documents are disabled. */
  locked: boolean;
}

export function consoleItemiseState(q: { loading: boolean; loadError: string | null; lines: ReadonlyArray<Pick<QuoteLine, 'source'>> }): ItemiseState {
  const needsItemising = !q.loading && !q.loadError && !isItemised(q.lines);
  return { needsItemising, locked: q.loading || !!q.loadError || needsItemising };
}

/**
 * The generated lines as inserts: source 'migration' (as the backfill writes), no id / submission_id, sort_order
 * 1..N in generator order (deterministic, so a concurrent second set collides on the sentinel index).
 */
export function itemiseLineInputs(row: BuyerSelectionsRowLike, pricing: QuotePricing): NewLineInput[] {
  return generateQuoteLines(buildGenerateInputFromRow(row, pricing, { source: 'migration' })).map((l, i) => {
    const { id: _id, submission_id: _s, ...rest } = l;
    return { ...rest, source: 'migration', sort_order: ITEMISE_SENTINEL_SORT_ORDER + i } as NewLineInput;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

/** Fresh row + live pricing (active rows, as the renderers' loaders read them), then the inserts. */
export async function fetchItemiseInputs(client: Client, submissionId: string): Promise<NewLineInput[]> {
  const [row, configs, materials, areas] = await Promise.all([
    client.from('buyer_selections').select('*').eq('id', submissionId).single(),
    client.from('pricing_config').select('*').eq('is_active', true),
    client.from('upgrade_materials').select('*').eq('is_active', true),
    client.from('unit_area_data').select('*'),
  ]);
  for (const r of [row, configs, materials, areas]) if (r.error) throw r.error;
  if (!row.data) throw new Error('Submission not found');
  const pricing = quotePricingFromRows({ config: configs.data, materials: materials.data, unitAreas: areas.data });
  return itemiseLineInputs(row.data as BuyerSelectionsRowLike, pricing);
}

export type ItemiseResult = { status: 'itemised'; count: number } | { status: 'already' } | { status: 'empty' };

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === '23505';

/** Re-checks, then inserts the whole set in one statement. 'already' when another tab / user itemised first. */
export async function itemiseSubmission(client: Client, submissionId: string): Promise<ItemiseResult> {
  const inputs = await fetchItemiseInputs(client, submissionId);
  if (!inputs.length) return { status: 'empty' };
  const existing = await client.from('quote_lines').select('id').eq('submission_id', submissionId)
    .in('source', ['wizard', 'migration']).limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return { status: 'already' };
  const rows = inputs.map((i) => ({ ...cleanPatch(i as Record<string, unknown>), submission_id: submissionId }));
  const ins = await client.from('quote_lines').insert(rows);
  if (ins.error) {
    if (isUniqueViolation(ins.error)) return { status: 'already' };
    throw ins.error;
  }
  return { status: 'itemised', count: rows.length };
}
