// Phase 1 renderers as the meeting console calls them (until Task 10 moves them onto quote_lines they still read the
// old buyer_selections model). Same paths as CustomPricingPanel / AdminSubmissions: buyer-facing preview and PDF pass
// staff=false (no internal notes); the Word export is the staff copy, as in CustomPricingPanel.
import { generateSavedSubmissionPdf } from '@/lib/savedSubmissionPdf';
import { downloadSubmissionWord } from '@/lib/submissionWordExport';

function pdfBlobUrl(b64: string): string {
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

/**
 * Buyer-facing client preview (CustomPricingPanel.openClientPreview). `win` is a tab opened synchronously in the click
 * handler, before any await, so Safari on the iPad does not block it as a popup.
 */
export async function openClientPreview(id: string, win: Window | null): Promise<void> {
  const url = pdfBlobUrl(await generateSavedSubmissionPdf(id, false, false));
  if (win && !win.closed) win.location.href = url;
  else window.open(url, '_blank');
}

/** Buyer PDF download (the AdminSubmissions buildBuyerPdfBase64 path, saved to a file). */
export async function downloadBuyerPdf(id: string): Promise<void> {
  await generateSavedSubmissionPdf(id, true, false);
}

/** Staff Word export (CustomPricingPanel: downloadSubmissionWord(id, true)). */
export async function downloadWord(id: string): Promise<void> {
  await downloadSubmissionWord(id, true);
}
