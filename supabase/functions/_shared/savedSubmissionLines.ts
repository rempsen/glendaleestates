// The lines a saved-submission renderer prints (Phase 2 Tasks 10–11). One rule for the browser (PDF, Word, exports,
// PM hub) and the edge functions (emails, HubSpot, QBO): an itemised submission's stored `quote_lines` win (removed
// dropped, in `sort_order`); a submission not itemised yet (not backfilled, or pricing unavailable at submit) falls
// back to the generator over the row — the same mapping the backfill uses — with any stored office / buyer-request
// lines appended (`mixed`), so every existing submission stays renderable and never shrinks. Zero non-relative imports.
import { generateQuoteLines, type QuoteBaseSpecRow, type QuoteLine, type QuotePricing } from './quoteLines.ts';
import { generateInputFromRowCore, type BuyerSelectionsRowLike } from './quoteSelectionsFromRow.ts';
import { baseSpecForCode } from './baseSpecData.ts';

/** Staff-copy footer note when a saved submission has no stored lines yet; the buyer copy prints nothing about it. */
export const GENERATED_LINES_NOTE = 'Generated from selections (not yet itemised)';

/** A stored `quote_lines` row, as far as the renderers need it (nullable location, as in the DB). */
export type StoredQuoteLineRow = Omit<QuoteLine, 'location'> & { location: string | null };

/**
 * `db`: the submission is itemised (at least one stored `wizard` / `migration` line) and stored lines are the quote.
 * `generated`: no stored lines; the generator over the row. `mixed`: stored lines exist but none is `wizard` /
 * `migration` (only `office` / `buyer_request` lines added before itemising): the generated quote PLUS those stored
 * lines appended, so an un-itemised unit never shows a smaller total than its generated quote (final fix wave C1).
 */
export type LinesSource = 'db' | 'generated' | 'mixed';

/** Sources the generator writes (wizard submit, backfill / console "Itemise this quote"). */
export const ITEMISED_SOURCES: ReadonlySet<string> = new Set(['wizard', 'migration']);

/** True when a stored set is the itemised quote (any line written by the generator, removed or not). */
export function isItemised(stored: ReadonlyArray<Pick<QuoteLine, 'source'>> | null | undefined): boolean {
  return (stored ?? []).some((l) => ITEMISED_SOURCES.has(l.source));
}

/** True for `generated` and `mixed`: the quote still comes (at least partly) from the generator at live prices. */
export const usesGeneratedLines = (src: LinesSource): boolean => src !== 'db';

export function savedSubmissionLinesCore(
  stored: ReadonlyArray<StoredQuoteLineRow> | null | undefined,
  row: BuyerSelectionsRowLike,
  pricing: QuotePricing,
  baseSpec: QuoteBaseSpecRow[] = baseSpecForCode(row?.unit_type),
): { lines: QuoteLine[]; linesSource: LinesSource } {
  const kept = (stored ?? [])
    .filter((l) => l.status !== 'removed')
    .map((l) => ({ ...l, location: l.location ?? '' }) as QuoteLine)
    .sort((a, b) => a.sort_order - b.sort_order);
  if (isItemised(stored)) return { lines: kept, linesSource: 'db' };
  const generated = generateQuoteLines(generateInputFromRowCore(row, pricing, baseSpec));
  if ((stored ?? []).length === 0) return { lines: generated, linesSource: 'generated' };
  const after = generated.reduce((m, l) => Math.max(m, l.sort_order), 0);
  return {
    lines: [...generated, ...kept.map((l, i) => ({ ...l, sort_order: after + i + 1 }))],
    linesSource: 'mixed',
  };
}

/**
 * Edge loader: the submission's stored lines via the service-role REST API (all statuses — an all-removed set is
 * still "stored"), else the generator over the row. Pass the PostgREST base URL and service key.
 */
export async function loadSubmissionLinesRest(args: {
  supabaseUrl: string; serviceKey: string; submissionId: string; row: BuyerSelectionsRowLike; pricing: QuotePricing;
  fetchImpl?: typeof fetch;
}): Promise<{ lines: QuoteLine[]; linesSource: LinesSource }> {
  const f = args.fetchImpl ?? fetch;
  const headers = { apikey: args.serviceKey, Authorization: `Bearer ${args.serviceKey}`, 'Content-Type': 'application/json' };
  const res = await f(`${args.supabaseUrl}/rest/v1/quote_lines?submission_id=eq.${encodeURIComponent(args.submissionId)}&order=sort_order.asc`, { headers });
  if (!res.ok) throw new Error(`quote_lines read failed (${res.status}): ${await res.text()}`);
  const stored = (await res.json()) as StoredQuoteLineRow[];
  return savedSubmissionLinesCore(stored, args.row, args.pricing);
}

/** Edge loader with a supabase-js service-role client (sync-hubspot / qbo-sync shape). Same rule as above. */
export async function loadSubmissionLinesClient(
  // deno-lint-ignore no-explicit-any
  admin: any, submissionId: string, row: BuyerSelectionsRowLike, pricing: QuotePricing,
): Promise<{ lines: QuoteLine[]; linesSource: LinesSource }> {
  const { data, error } = await admin.from('quote_lines').select('*').eq('submission_id', submissionId).order('sort_order', { ascending: true });
  if (error) throw new Error(`quote_lines read failed: ${error.message ?? String(error)}`);
  return savedSubmissionLinesCore((data ?? []) as StoredQuoteLineRow[], row, pricing);
}
