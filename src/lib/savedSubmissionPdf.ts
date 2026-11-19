import { internalAreaNotes } from '@/lib/areaNotes';
import { supabase } from '@/integrations/supabase/client';
import { generateBuyerPreviewPDF } from '@/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';
import {
  GENERATED_LINES_NOTE, quotePricingFromRows, savedSubmissionLines, type StoredQuoteLineRow,
} from '@/lib/generateInputFromSelections';

/**
 * The one fresh-record service for saved-submission outputs (PDF and Word). Re-reads the complete saved row and its
 * `quote_lines` (status <> 'removed', in sort_order). A submission with no stored lines yet falls back to the
 * generator over the row with live prices (`linesSource: 'generated'`), so every existing submission stays renderable.
 */
export async function loadSavedSubmissionContext(id: string) {
  const [submission, lineRows, configs, materials, areas] = await Promise.all([
    supabase.from('buyer_selections').select('*').eq('id', id).single(),
    supabase.from('quote_lines').select('*').eq('submission_id', id).neq('status', 'removed').order('sort_order', { ascending: true }),
    supabase.from('pricing_config').select('*'),
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
    sourceNote: staff && linesSource === 'generated' ? GENERATED_LINES_NOTE : undefined,
  });
  if (typeof result !== 'string') throw new Error('PDF generation returned no file');
  return result;
}
