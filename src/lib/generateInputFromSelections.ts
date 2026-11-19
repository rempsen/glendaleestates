// Wizard state → `buyer_selections` row → GenerateInput → quote lines (Phase 2 Task 9, spec §6.16 "Wizard parity").
// The same row → input mapping serves the wizard, send-selections-email (after the insert), the backfill and the
// parity harness (scripts/lib/generateInputFromRow.ts re-exports from here), so the lines the buyer sees in the
// RunningTotal rail are the lines the server regenerates and writes at submit.
import {
  generateInputFromRowCore, unitTypeCodeOfRow, type BuyerSelectionsRowLike,
} from '@shared/quoteSelectionsFromRow';
import { buyerSelectionsInsertRow, parseSelectionBody } from '@shared/submissionRow';
import {
  generateQuoteLines, windowCounts, type GenerateInput, type QuoteBaseSpecRow, type QuoteLine, type QuotePricing,
  type QuoteWindow,
} from '@shared/quoteLines';
import { toQuoteWindows } from '@shared/wizardWindows';
import { serverPricingFromRows } from '@shared/loadServerPricing';
import { baseSpecFor } from '@/lib/baseSpec';

export const unitTypeCodeOf = (row: BuyerSelectionsRowLike): string | null => unitTypeCodeOfRow(row);

/** Row → GenerateInput. Base spec defaults to `baseSpecFor(unit type)`; source defaults to the generator's ('wizard'). */
export function buildGenerateInputFromRow(
  row: BuyerSelectionsRowLike,
  pricing: QuotePricing,
  opts: { baseSpec?: QuoteBaseSpecRow[]; source?: 'wizard' | 'migration'; windows?: QuoteWindow[] | null } = {},
): GenerateInput {
  return generateInputFromRowCore(row, pricing, opts.baseSpec ?? baseSpecFor(unitTypeCodeOfRow(row)), {
    source: opts.source, windows: opts.windows,
  });
}

/**
 * Pricing for the generator from the rows `useDynamicPricing()` already fetched — the same rows and the same
 * function (`serverPricingFromRows`) the edge loader uses, so client and server price identically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quotePricingFromRows(rows: { config?: any[] | null; materials?: any[] | null; unitAreas?: any[] | null }): QuotePricing {
  return serverPricingFromRows({ pricing_config: rows.config, upgrade_materials: rows.materials, unit_area_data: rows.unitAreas });
}

/** The wizard's in-progress state, as far as the submit body needs it (SelectionState in SelectionWizard.tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WizardSelections = Record<string, any> & {
  windows?: QuoteWindow[];
  backsplashGrout?: { enabled?: boolean; groutColor?: string; comments?: string };
  bedroomLvpSameAsMain?: boolean;
  lvpColour?: string;
  bedroomLvpColour?: string;
};
export interface WizardUnitInfo { unitType?: string | null }

/**
 * The JSON body the wizard POSTs to send-selections-email. The three integer columns are derived from the located
 * windows list (Phase 1 renderers read them until Task 11); the list itself travels as `windows`.
 */
export function wizardSubmitBody(
  selections: WizardSelections,
  unitInfo: WizardUnitInfo | null,
  extra: { windowTotal?: number; subtotal?: number; pdfBase64?: string | null } = {},
): Record<string, unknown> {
  const windows = toQuoteWindows(Array.isArray(selections.windows) ? selections.windows : []);
  const grout = selections.backsplashGrout || {};
  return {
    ...selections,
    ...windowCounts(windows),
    windows,
    unitType: unitInfo?.unitType || null,
    bedroomLvpColour: selections.bedroomLvpSameAsMain ? selections.lvpColour : selections.bedroomLvpColour,
    windowTotal: extra.windowTotal ?? 0,
    subtotal: extra.subtotal ?? null,
    backsplashGroutEnabled: !!grout.enabled,
    backsplashGroutColor: grout.groutColor,
    backsplashGroutComments: grout.comments,
    pdfBase64: extra.pdfBase64 ?? null,
  };
}

/**
 * The `buyer_selections`-shaped object the server will insert for this wizard state: the submit body, through JSON
 * (as on the wire), through the server's own parse + insert-row functions.
 */
export function wizardSelectionsToRow(selections: WizardSelections, unitInfo: WizardUnitInfo | null): Record<string, unknown> {
  const wire = JSON.parse(JSON.stringify(wizardSubmitBody(selections, unitInfo)));
  return buyerSelectionsInsertRow(parseSelectionBody(wire));
}

/** The lines the rail shows and the server regenerates: in-progress wizard state → row → generator. */
export function wizardQuoteLines(selections: WizardSelections, unitInfo: WizardUnitInfo | null, pricing: QuotePricing): QuoteLine[] {
  const windows = toQuoteWindows(Array.isArray(selections.windows) ? selections.windows : []);
  return generateQuoteLines(buildGenerateInputFromRow(wizardSelectionsToRow(selections, unitInfo), pricing, { windows }));
}

/** Staff-copy footer note when a saved submission has no stored lines yet; the buyer copy prints nothing about it. */
export const GENERATED_LINES_NOTE = 'Generated from selections (not yet itemised)';

/** A stored `quote_lines` row, as far as the renderers need it (nullable location, as in the DB). */
export type StoredQuoteLineRow = Omit<QuoteLine, 'location'> & { location: string | null };

/**
 * The lines a saved-submission renderer prints (Phase 2 Task 10). Stored `quote_lines` win (removed dropped, in
 * `sort_order`); a submission with none yet (not backfilled, or pricing unavailable at submit) falls back to the
 * generator over the row — the same mapping the backfill uses — so every existing submission stays renderable.
 */
export function savedSubmissionLines(
  stored: ReadonlyArray<StoredQuoteLineRow> | null | undefined,
  row: BuyerSelectionsRowLike,
  pricing: QuotePricing,
): { lines: QuoteLine[]; linesSource: 'db' | 'generated' } {
  const kept = (stored ?? [])
    .filter((l) => l.status !== 'removed')
    .map((l) => ({ ...l, location: l.location ?? '' }) as QuoteLine)
    .sort((a, b) => a.sort_order - b.sort_order);
  if ((stored ?? []).length > 0) return { lines: kept, linesSource: 'db' };
  return { lines: generateQuoteLines(buildGenerateInputFromRow(row, pricing)), linesSource: 'generated' };
}
