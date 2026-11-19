// Buyer review page model (/my-quote, Phase 2 Task 13, spec §6.7, §6.15, §6.16). Pure: RPC rows in, page state out.
// Buyers never read `quote_lines` or `buyer_selections` directly: lines come from get_my_quote_lines() and the header
// from get_my_quote_header() (both SECURITY DEFINER, matched on auth.jwt() ->> 'email'). Every row still passes an
// explicit allow-list here, so an internal field can never reach the DOM, PDF or Word even if a caller leaks one in.
// No arithmetic: totals come from buildLineRows -> sumQuoteLines, the same function as the rail and the PDF.
import type { QuoteLine, Section, LineStatus, LineUnit } from '@/lib/quoteLines';
import { buildLineRows, CountedHiddenLineError, type LineRenderModel } from '@/lib/lineRenderRows';
import type { BuyerSelections } from '@/lib/buyerPdfGenerator';
import { OFFICE_CONTACT_TEXT } from '@shared/buyerContact';

export { OFFICE_CONTACT_TEXT };
export const NO_QUOTE_TEXT = 'No quote found for this sign-in';
export const UNAVAILABLE_TEXT = 'Your quote cannot be shown right now';
export const EMPTY_TEXT = 'Your itemised quote is being prepared';
export const NOT_ITEMISED_TEXT = 'This quote has not been itemised yet; please contact the office';
export const CHANGE_REQUEST_MAX = 300;
export const REVIEW_COMMENT_MAX = 500;

export type ReviewResponse = 'accepted' | 'questioned';

/** Columns returned by public.get_my_quote_lines() (migration 0006). */
export interface MyQuoteRpcLine {
  id: string; submission_id: string; section: string; location: string | null; label: string;
  product_name: string | null; product_colour: string | null; quantity: number | null; unit: string | null;
  unit_price: number | null; amount: number | null; status: string; client_note: string | null;
  provisional: boolean; sort_order: number;
}

/** Columns returned by public.get_my_quote_header() (migration 0012): the caller's own identity fields only. */
export interface MyQuoteHeader {
  submission_id: string; unit_number: string; unit_type: string | null; first_name: string; last_name: string;
  email: string; phone_number: string | null; estimated_possession_date: string | null; status: string | null; created_at: string;
}

export interface LineReview { id?: string; line_id: string; response: ReviewResponse; comment: string | null; created_at: string }

export type MyQuoteState =
  | { kind: 'no_quote'; title: string; contact: string }
  | { kind: 'unavailable'; title: string; contact: string }
  | { kind: 'empty'; title: string; contact: string; header: MyQuoteHeader | null }
  | {
    kind: 'ready'; submissionId: string; header: MyQuoteHeader | null; lines: QuoteLine[]; model: LineRenderModel;
    reviews: Map<string, LineReview>; gstRate: number; contact: string;
  };

const UNITS: readonly LineUnit[] = ['sqft', 'sqyd', 'each', 'flat'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** Explicit allow-list from an RPC row to a QuoteLine. Anything not named here (internal_note, flagged_to …) is dropped. */
export function toBuyerLine(r: MyQuoteRpcLine): QuoteLine {
  const unit = (UNITS as readonly string[]).includes(r.unit ?? '') ? (r.unit as LineUnit) : 'flat';
  return {
    id: r.id,
    submission_id: r.submission_id,
    sort_order: num(r.sort_order) ?? 0,
    section: r.section as Section,
    location: str(r.location) ?? '',
    label: str(r.label) ?? '',
    product_name: str(r.product_name),
    product_colour: str(r.product_colour),
    quantity: num(r.quantity),
    unit,
    unit_price: num(r.unit_price),
    amount: num(r.amount),
    status: r.status as LineStatus,
    client_note: str(r.client_note),
    provisional: r.provisional === true,
    // Placeholders for required fields the RPC does not expose (never printed).
    pricing_mode: 'manual',
    source: 'office',
    client_visible: true,
  };
}

/** Latest response per line (created_at desc; later input wins a tie). */
export function latestReviewByLine(reviews: readonly LineReview[]): Map<string, LineReview> {
  const m = new Map<string, LineReview>();
  for (const r of reviews) {
    const cur = m.get(r.line_id);
    if (!cur || Date.parse(r.created_at) >= Date.parse(cur.created_at)) m.set(r.line_id, r);
  }
  return m;
}

export function stateFromBuyerLines(input: {
  header: MyQuoteHeader | null; lines: QuoteLine[]; reviews: readonly LineReview[]; gstRate: number;
}): MyQuoteState {
  const submissionId = input.header?.submission_id ?? input.lines[0]?.submission_id;
  if (!submissionId) return { kind: 'no_quote', title: NO_QUOTE_TEXT, contact: OFFICE_CONTACT_TEXT };
  const lines = input.lines.filter((l) => l.submission_id === submissionId);
  if (!lines.length) return { kind: 'empty', title: EMPTY_TEXT, contact: OFFICE_CONTACT_TEXT, header: input.header };
  let model: LineRenderModel;
  try {
    model = buildLineRows(lines, { buyerView: true, gstRate: input.gstRate });
  } catch (e) {
    if (e instanceof CountedHiddenLineError) return { kind: 'unavailable', title: UNAVAILABLE_TEXT, contact: OFFICE_CONTACT_TEXT };
    throw e;
  }
  const ids = new Set(lines.map((l) => l.id));
  const reviews = latestReviewByLine(input.reviews.filter((r) => ids.has(r.line_id)));
  return { kind: 'ready', submissionId, header: input.header, lines, model, reviews, gstRate: input.gstRate, contact: OFFICE_CONTACT_TEXT };
}

/**
 * The header to show: the newest submission (headers are newest first) that has visible lines, else the newest.
 * One buyer email can hold more than one submission; an older itemised one is not hidden by a newer empty one.
 */
export function pickHeader(headers: readonly MyQuoteHeader[], lines: readonly Pick<MyQuoteRpcLine, 'submission_id'>[]): MyQuoteHeader | null {
  const withLines = new Set(lines.map((l) => l.submission_id));
  return headers.find((h) => withLines.has(h.submission_id)) ?? headers[0] ?? null;
}

/**
 * request_quote_change() arguments: the change goes to the submission the page shows (`state.submissionId`, pickHeader's
 * choice), never to whichever is newest; the RPC re-checks that it belongs to the caller's email.
 */
export function changeRequestArgs(state: MyQuoteState | null, text: string): { _text: string; _submission_id?: string } {
  return state?.kind === 'ready' ? { _text: text, _submission_id: state.submissionId } : { _text: text };
}

/** PostgREST "function not found": get_my_quote_header (0012) is not applied yet; render from the lines alone. */
export const isMissingRpc = (e: { code?: string } | null | undefined): boolean => e?.code === 'PGRST202';

/** Buyer-facing text for a failed request_quote_change() call. */
export function changeRequestErrorText(e: { message?: string } | null | undefined): string {
  return /not been itemised/i.test(e?.message ?? '') ? NOT_ITEMISED_TEXT : OFFICE_CONTACT_TEXT;
}

/**
 * Page state from the two RPCs and the caller's own reviews. `headers` is newest first; the shown submission is
 * `pickHeader`'s (with no header at all the lines' own submission, titled "Your quote").
 */
export function buildMyQuoteState(input: {
  headers: readonly MyQuoteHeader[]; lines: readonly MyQuoteRpcLine[]; reviews: readonly LineReview[]; gstRate: number;
}): MyQuoteState {
  return stateFromBuyerLines({
    header: pickHeader(input.headers, input.lines),
    lines: input.lines.map(toBuyerLine),
    reviews: input.reviews,
    gstRate: input.gstRate,
  });
}

/** Console Buyer column text (icon aria-label and tooltip). */
export function buyerResponseLabel(review?: LineReview): string {
  if (!review) return 'Buyer: no response';
  const what = review.response === 'accepted' ? 'Accepted' : 'Questioned';
  return `Buyer: ${what}${review.comment ? ` — “${review.comment}”` : ''}`;
}

export function validateReviewComment(text: string): { ok: true; comment: string | null } | { ok: false; reason: string } {
  const t = text.trim();
  if (t.length > REVIEW_COMMENT_MAX) return { ok: false, reason: `Keep your comment under ${REVIEW_COMMENT_MAX} characters.` };
  return { ok: true, comment: t || null };
}

export function validateChangeRequest(text: string): { ok: true; text: string } | { ok: false; reason: string } {
  const t = text.trim();
  if (!t) return { ok: false, reason: 'Describe the change you would like.' };
  if (t.length > CHANGE_REQUEST_MAX) return { ok: false, reason: `Keep your request under ${CHANGE_REQUEST_MAX} characters.` };
  return { ok: true, text: t };
}

/**
 * The buyer PDF / Word header from get_my_quote_header(): identity fields only. Selection colours and products are
 * in the lines; comments, custom pricing and area notes are deliberately absent from the buyer download.
 */
export function buyerPdfSelectionsFromHeader(h: MyQuoteHeader): BuyerSelections {
  return {
    unitNumber: h.unit_number, firstName: h.first_name, lastName: h.last_name, email: h.email,
    phoneNumber: h.phone_number || '', estimatedPossessionDate: h.estimated_possession_date || '',
    hasStairs: false, lvpColour: '', spcTileColour: '', backsplashOrientation: '', stairCarpetColour: '',
    bedroomFlooringChoice: '', bedroomCarpetColour: '', bedroomLvpColour: '', bedroomLvpSameAsMain: false,
    additionalWindowsQty: 0, patioDoorsQty: 0, automatedWindowsQty: 0, windowComments: '',
    areaUpgrades: [], upgradeFloorSelection: null, backsplashGrout: { enabled: false, groutColor: '', comments: '' },
    bathroomTileSelected: false, heatedFloorBathrooms: 0, customPricing: null, upgradeInterests: {},
  };
}
