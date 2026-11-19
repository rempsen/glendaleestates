// In-memory EsignProvider for tests (provider contract test, handler tests). Not used by any deployed function.
import type { CreateDocumentInput, CreatedDocument, EsignProvider, HeaderBag, ParsedWebhook } from './provider.ts';

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

export class FakeEsignProvider implements EsignProvider {
  readonly name = 'fake';
  readonly created: CreateDocumentInput[] = [];
  /** providerDocumentId → provider-side state for confirmStatus (absent = 'open', or 'signed' when completed). */
  readonly states = new Map<string, 'signed' | 'declined' | 'voided' | 'open'>();
  /** providerDocumentId → completed PDF bytes (absent = not completed). */
  readonly completed = new Map<string, Uint8Array>();
  private seq = 0;

  constructor(private readonly secret = 'fake-secret') {}

  createDocument(input: CreateDocumentInput): Promise<CreatedDocument> {
    if (!input.pdfUrl && !input.pdfBytes) return Promise.reject(new Error('createDocument needs pdfUrl or pdfBytes'));
    this.created.push(input);
    const id = `fake-doc-${++this.seq}`;
    return Promise.resolve({ providerDocumentId: id, embeddedSigningUrl: `https://sign.fake.test/${id}` });
  }

  verifyWebhook(rawBody: string, headers: HeaderBag): Promise<boolean> {
    const sig = headers.get(FAKE_SIGNATURE_HEADER);
    return Promise.resolve(!!sig && sig === FakeEsignProvider.sign(this.secret, rawBody));
  }

  parseWebhook(rawBody: string): ParsedWebhook {
    try {
      const j = JSON.parse(rawBody) as { event?: unknown; id?: unknown };
      const event = j.event === 'signed' || j.event === 'declined' || j.event === 'voided' ? j.event : 'other';
      return { event, providerDocumentId: typeof j.id === 'string' ? j.id : null, rawType: String(j.event ?? '') };
    } catch {
      return { event: 'other', providerDocumentId: null };
    }
  }

  confirmStatus(providerDocumentId: string): Promise<'signed' | 'declined' | 'voided' | 'open'> {
    return Promise.resolve(this.states.get(providerDocumentId) ?? (this.completed.has(providerDocumentId) ? 'signed' : 'open'));
  }

  downloadSignedPdf(providerDocumentId: string): Promise<Uint8Array> {
    const b = this.completed.get(providerDocumentId);
    return b ? Promise.resolve(b) : Promise.reject(new Error('not completed'));
  }

  /** Toy signature (not crypto): secret + body length + body. */
  static sign(secret: string, rawBody: string): string {
    return `${secret}:${rawBody.length}:${rawBody}`;
  }
}
