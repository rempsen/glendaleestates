// Header output actions for the meeting console (Task 8 fix round 1). The buyer sits at this screen, so every
// action names its audience: client copies never include internal notes; staff copies say so in the label.
// Pure: the renderers are injected, so scripts/console-actions.test.ts checks which copy each action asks for.

export type OutputAction = 'preview' | 'word_client' | 'word_staff' | 'pdf_client' | 'pdf_staff';

export interface OutputActionInfo { id: OutputAction; label: string; staff: boolean }

export const OUTPUT_ACTIONS: readonly OutputActionInfo[] = [
  { id: 'preview', label: 'Client preview', staff: false },
  { id: 'word_client', label: 'Word (client)', staff: false },
  { id: 'word_staff', label: 'Word (staff copy)', staff: true },
  { id: 'pdf_client', label: 'PDF (client)', staff: false },
  { id: 'pdf_staff', label: 'PDF (staff copy)', staff: true },
];

export interface Renderers {
  /** generateSavedSubmissionPdf(id, saveToFile, staff) */
  pdf: (id: string, saveToFile: boolean, staff: boolean) => Promise<unknown>;
  /** downloadSubmissionWord(id, staff) */
  word: (id: string, staff: boolean) => Promise<void>;
  /** Shows a rendered PDF (base64) in the tab opened at click time. */
  showPdf: (b64: string, win: Window | null) => void;
}

export async function runOutputAction(action: OutputAction, id: string, r: Renderers, win: Window | null = null): Promise<void> {
  switch (action) {
    case 'preview': r.showPdf(String(await r.pdf(id, false, false)), win); return;
    case 'word_client': await r.word(id, false); return;
    case 'word_staff': await r.word(id, true); return;
    case 'pdf_client': await r.pdf(id, true, false); return;
    case 'pdf_staff': await r.pdf(id, true, true); return;
  }
}
