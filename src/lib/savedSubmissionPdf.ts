import { internalAreaNotes } from '@/lib/areaNotes';
import { supabase } from '@/integrations/supabase/client';
import { generateBuyerPreviewPDF } from '@/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';
import { buyerPdfSelectionsFromHeader, type MyQuoteHeader } from '@/lib/myQuoteModel';
import type { QuoteLine } from '@/lib/quoteLines';
import {
  GENERATED_LINES_NOTE, quotePricingFromRows, savedSubmissionLines, type StoredQuoteLineRow,
} from '@/lib/generateInputFromSelections';

/**
 * The one fresh-record service for saved-submission outputs (PDF and Word). Re-reads the complete saved row and its
 * `quote_lines` (all statuses, so an all-removed set still counts as stored; removed lines dropped in memory). A submission with no stored lines yet falls back to the
 * generator over the row with live prices (`linesSource: 'generated'`), so every existing submission stays renderable.
 */
export async function loadSavedSubmissionContext(id: string) {
  const [submission, lineRows, configs, materials, areas] = await Promise.all([
    supabase.from('buyer_selections').select('*').eq('id', id).single(),
    // No status filter: a submission whose lines are all removed HAS stored lines (staff deleted them) and must not
    // fall back to the generator; savedSubmissionLines drops removed lines in memory.
    supabase.from('quote_lines').select('*').eq('submission_id', id).order('sort_order', { ascending: true }),
    supabase.from('pricing_config').select('*').eq('is_active', true),
    supabase.from('upgrade_materials').select('*').eq('is_active', true),
    supabase.from('unit_area_data').select('*'),
  ]);
  for (const result of [submission, lineRows, configs, materials, areas]) {
    if (result.error) throw result.error;
  }
  if (!submission.data || !configs.data || !materials.data || !areas.data) throw new Error('Unable to load saved selections and pricing');
  // Same rows → pricing function as the wizard rail and the edge loader, so the fallback prices as the server would.
  const quotePricing = quotePricingFromRows({ config: configs.data, materials: materials.data, unitAreas: areas.data });
  const { lines, linesSource } = savedSubmissionLines(
    (lineRows.data ?? []) as unknown as StoredQuoteLineRow[], submission.data, quotePricing);
  return {
    s: submission.data,
    unitCode: submission.data.unit_type ? normalizeUnitTypeCode(submission.data.unit_type) : null,
    lines,
    linesSource,
    gstRate: quotePricing.gstRate,
  };
}

// `staff` adds every line, the internal Office Record and the internal-notes block for admin downloads only.
// Buyer-facing paths (email, preview) must leave it false.
export async function generateSavedSubmissionPdf(id: string, saveToFile = false, staff = false): Promise<string> {
  const { s, lines, linesSource, gstRate } = await loadSavedSubmissionContext(id);
  const result = await generateBuyerPreviewPDF(toBuyerPdfSelections(s), { lines, gstRate }, {
    saveToFile, returnBase64: true,
    footerLabel: staff ? 'STAFF COPY — Contains internal notes' : `Submitted selections — ${s.status || 'submitted'}`,
    staffRecord: staff ? { submittedAt: s.created_at, status: s.status, adminNotes: (s as any).admin_notes, salesComments: s.sales_comments, areaInternalNotes: internalAreaNotes(s.area_upgrades as never) } : undefined,
    sourceNote: staff && linesSource !== 'db' ? GENERATED_LINES_NOTE : undefined,
  });
  if (typeof result !== 'string') throw new Error('PDF generation returned no file');
  return result;
}

/**
 * Buyer copy for /my-quote. Buyers cannot read buyer_selections or quote_lines, so this renders from the buyer-safe
 * RPC rows (get_my_quote_header / get_my_quote_lines) the page already holds: never `staff`, no staff record.
 */
export async function generateBuyerQuotePdf(header: MyQuoteHeader, lines: QuoteLine[], gstRate: number): Promise<void> {
  await generateBuyerPreviewPDF(buyerPdfSelectionsFromHeader(header), { lines, gstRate }, {
    saveToFile: true, footerLabel: `Live quote — ${header.status || 'submitted'}`,
  });
}

/**
 * Buyer copy rendered FROM A QUOTE SNAPSHOT (Task 14, send for signature): the same buyer renderer and buyer-safe
 * mapper as the client PDF, but the lines are the frozen snapshot lines, not a fresh read. Never `staff`; internal
 * notes are stripped by the caller (esignSend.buyerSafeLines) and the buyer view prints none anyway.
 */
export async function generateSnapshotBuyerPdf(
  submission: Parameters<typeof toBuyerPdfSelections>[0], lines: QuoteLine[], gstRate: number, version: number,
): Promise<Blob> {
  const b64 = await generateBuyerPreviewPDF(toBuyerPdfSelections(submission), { lines, gstRate }, {
    saveToFile: false, returnBase64: true, footerLabel: `Quote version ${version} — for signature`,
  });
  if (typeof b64 !== 'string' || !b64) throw new Error('PDF generation returned no file');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}
