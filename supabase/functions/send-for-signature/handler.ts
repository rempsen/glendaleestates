// Core of send-for-signature with all I/O injected (tested in scripts/esign-send-handler.test.ts and handler.test.ts).
// The console has already: inserted the quote_snapshot, rendered the buyer PDF from the snapshot lines, created the
// documents row (status 'draft') and uploaded the PDF to unit-documents/{unit}/{document_id}.pdf.
import type { InternalAuthResult } from '../_shared/internalAuth.ts';
import type { EsignProvider } from '../_shared/esign/provider.ts';
import { documentTitle, isUuid, unitDocumentPath } from '../_shared/esign/documents.ts';

export interface SendDocumentContext {
  id: string;
  submissionId: string;
  kind: string;
  status: string;
  storagePath: string | null;
  snapshotId: string | null;
  unitNumber: string | null;
  buyerName: string;
  buyerEmail: string | null;
}

export interface SendDeps {
  loadDocument(id: string): Promise<SendDocumentContext | null>;
  /** esign_provider setting (portal_settings), already parsed. */
  providerName(): Promise<string>;
  provider(name: string): EsignProvider | null;
  /** Short-lived signed URL for a path in the unit-documents bucket. */
  signedUrl(path: string, expiresInSeconds: number): Promise<string>;
  /** Marks the row sent; false when the row was no longer 'draft' (a concurrent send). */
  markSent(id: string, patch: { provider: string; provider_envelope_id: string; status: 'sent'; signer_email: string }): Promise<boolean>;
  audit(row: { submission_id: string; changed_by_user_id: string | null; changed_by_email: string | null; action_type: string; change_summary: string; changes: Record<string, unknown> }): Promise<void>;
}

export interface HandlerResult { status: number; body: Record<string, unknown> }

export const SIGNED_URL_SECONDS = 600;

export async function handleSendForSignature(body: unknown, auth: InternalAuthResult, deps: SendDeps): Promise<HandlerResult> {
  if (auth.ok === false) return { status: 401, body: { error: 'Unauthorized' } };
  if (auth.kind !== 'admin' && auth.kind !== 'staff') return { status: 403, body: { error: 'Staff sign-in required' } };

  const documentId = body && typeof body === 'object' ? (body as { document_id?: unknown }).document_id : undefined;
  if (!isUuid(documentId)) return { status: 400, body: { error: 'document_id (uuid) is required' } };

  const doc = await deps.loadDocument(documentId);
  if (!doc) return { status: 404, body: { error: 'Document not found' } };
  if (doc.status !== 'draft') return { status: 409, body: { error: `Document is ${doc.status}, not draft` } };
  const expectedPath = unitDocumentPath(doc.unitNumber, doc.id);
  if (doc.storagePath !== expectedPath) return { status: 409, body: { error: 'Document PDF is not uploaded yet' } };
  const email = (doc.buyerEmail ?? '').trim();
  if (!email || !email.includes('@')) return { status: 422, body: { error: 'The buyer has no email address on file' } };

  const providerName = await deps.providerName();
  const provider = deps.provider(providerName);
  if (!provider) return { status: 501, body: { error: `E-sign provider "${providerName}" is not available` } };

  const pdfUrl = await deps.signedUrl(expectedPath, SIGNED_URL_SECONDS);
  const title = documentTitle(doc.unitNumber, doc.kind);
  const created = await provider.createDocument({
    pdfUrl,
    fileName: `Unit-${doc.unitNumber ?? 'unit'}-${doc.kind}.pdf`,
    title,
    signer: { name: doc.buyerName || email, email },
    metadata: { document_id: doc.id, submission_id: doc.submissionId },
  });

  const updated = await deps.markSent(doc.id, {
    provider: provider.name, provider_envelope_id: created.providerDocumentId, status: 'sent', signer_email: email,
  });
  if (!updated) return { status: 409, body: { error: 'Document was sent by someone else meanwhile' } };

  await deps.audit({
    submission_id: doc.submissionId,
    changed_by_user_id: auth.userId ?? null,
    changed_by_email: auth.email ?? null,
    action_type: 'esign_sent',
    change_summary: `${title} sent for signature`,
    changes: { document_id: doc.id, snapshot_id: doc.snapshotId, provider: provider.name, provider_document_id: created.providerDocumentId, signer_email: email },
  });

  return { status: 200, body: { embedded_signing_url: created.embeddedSigningUrl, provider_document_id: created.providerDocumentId } };
}
