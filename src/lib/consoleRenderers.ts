// Phase 1 renderers as the meeting console calls them (until Task 10 moves them onto quote_lines they still read the
// old buyer_selections model). Which copy (client / staff) each header action asks for lives in consoleActions.ts.
import { generateSavedSubmissionPdf } from '@/lib/savedSubmissionPdf';
import { downloadSubmissionWord } from '@/lib/submissionWordExport';
import type { Renderers } from '@/lib/consoleActions';

function pdfBlobUrl(b64: string): string {
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

export const consoleRenderers: Renderers = {
  pdf: (id, saveToFile, staff) => generateSavedSubmissionPdf(id, saveToFile, staff),
  word: (id, staff) => downloadSubmissionWord(id, staff),
  // `win` was opened in the click handler, before any await, so Safari on the iPad does not block it as a popup.
  showPdf: (b64, win) => {
    const url = pdfBlobUrl(b64);
    if (win && !win.closed) win.location.href = url;
    else window.open(url, '_blank');
  },
};
