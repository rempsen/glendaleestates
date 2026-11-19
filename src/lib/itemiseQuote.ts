// "Itemise this quote" (final fix wave C1): a submission with no stored wizard / migration lines is not itemised —
// every renderer shows its generated quote (plus any office / buyer-request lines, `mixed`), but the console edits
// stored lines only. Staff itemise first: the generated lines are inserted as source='migration' (the backfill's
// mapping: buildGenerateInputFromRow over the row at live prices) through useQuoteLines.createLine, so the audit
// trigger and the client invariants (counted-hidden refusal, forbidden keys) apply to each insert. Until then the
// console locks Add line, status edits, Send for signature and Documents.
import { generateQuoteLines, type QuoteLine } from '@/lib/quoteLines';
import { buildGenerateInputFromRow, quotePricingFromRows } from '@/lib/generateInputFromSelections';
import { isItemised } from '@shared/savedSubmissionLines';
import type { BuyerSelectionsRowLike } from '@shared/quoteSelectionsFromRow';
import type { QuotePricing } from '@/lib/quoteLines';
import type { NewLineInput } from '@/hooks/useQuoteLines';

export const ITEMISE_BANNER_TITLE = 'This quote has not been itemised yet';
export const ITEMISE_BANNER_TEXT = 'Buyers, PDFs and emails see the quote generated from the selections. Itemise it to '
  + 'edit lines, change statuses, add lines or send documents.';
export const ITEMISE_LOCKED_REASON = 'Itemise this quote first';

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

/** The generated lines as console inserts: source 'migration' (as the backfill writes), no id / submission_id. */
export function itemiseLineInputs(row: BuyerSelectionsRowLike, pricing: QuotePricing): NewLineInput[] {
  return generateQuoteLines(buildGenerateInputFromRow(row, pricing, { source: 'migration' })).map((l) => {
    const { id: _id, submission_id: _s, ...rest } = l;
    return { ...rest, source: 'migration' } as NewLineInput;
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
