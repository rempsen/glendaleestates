// E-signature provider seam (spec §6.8, ADR-1). SignWell is the first implementation (./signwell.ts); swapping to
// BoldSign is one new file implementing this interface. Dependency-free: runs under Deno (edge), Bun (tests) and Vite.

export interface EsignSigner { name: string; email: string }

export interface CreateDocumentInput {
  /** Short-lived URL the provider fetches the PDF from. One of pdfUrl / pdfBytes is required. */
  pdfUrl?: string;
  pdfBytes?: Uint8Array;
  /** File name shown by the provider, e.g. "Unit-24-selection_sheet.pdf". */
  fileName: string;
  title: string;
  signer: EsignSigner;
  /** Echoed back in webhooks; never secrets or internal notes. */
  metadata: { document_id: string; submission_id: string };
}

export interface CreatedDocument { providerDocumentId: string; embeddedSigningUrl: string }

export type EsignEventKind = 'signed' | 'declined' | 'voided' | 'other';

export interface ParsedWebhook {
  event: EsignEventKind;
  /** Provider's id for the document; null when the payload carries none. */
  providerDocumentId: string | null;
  signedPdfUrl?: string;
  /** The provider's raw event name (for logs / audit). */
  rawType?: string;
}

export interface HeaderBag { get(name: string): string | null }

export interface EsignProvider {
  /** Value stored in documents.provider. */
  readonly name: string;
  createDocument(input: CreateDocumentInput): Promise<CreatedDocument>;
  /** Authenticity check on the exact bytes received. Must fail closed (missing secret / signature → false). */
  verifyWebhook(rawBody: string, headers: HeaderBag): Promise<boolean>;
  /** Only call after verifyWebhook returned true. Never throws: unknown shapes are { event: 'other' }. */
  parseWebhook(rawBody: string): ParsedWebhook;
  /** The completed (signed) PDF. Throws when the provider has no completed file for this document. */
  downloadSignedPdf(providerDocumentId: string): Promise<Uint8Array>;
  /**
   * Optional: the provider's current state of the document, read from its API. Providers whose webhook signature does
   * not cover the body (SignWell) implement it so a replayed signature cannot decline / void another document.
   */
  confirmStatus?(providerDocumentId: string): Promise<EsignEventKind | 'open'>;
}

export class EsignProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'EsignProviderError';
  }
}
