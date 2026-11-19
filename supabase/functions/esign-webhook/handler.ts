// Core of esign-webhook with all I/O injected (tested in scripts/esign-webhook.test.ts and handler.test.ts).
// Order is a security property: verifyWebhook runs on the raw bytes BEFORE any parsing or database access.
import type { EsignProvider, HeaderBag } from '../_shared/esign/provider.ts';
import { parseStatusAfterSigned, statusAdvancePatch, unitDocumentPath } from '../_shared/esign/documents.ts';

export interface WebhookDocument {
  id: string;
  submissionId: string;
  status: string;
  kind: string;
  unitNumber: string | null;
  submission: { status: string | null; reviewed_at?: string | null; quoted_at?: string | null; completed_at?: string | null };
}

export interface WebhookDeps {
  provider: EsignProvider;
  findDocument(provider: string, providerDocumentId: string): Promise<WebhookDocument | null>;
  /** Overwrites unit-documents/{path}. */
  uploadPdf(path: string, bytes: Uint8Array): Promise<void>;
  /** Conditional update (only when the current status is in `fromStatuses`); false = nothing matched. */
  updateDocument(id: string, fromStatuses: string[], patch: Record<string, unknown>): Promise<boolean>;
  /** esign_status_after_signed raw value; undefined when the setting row is missing. */
  statusAfterSignedSetting(): Promise<unknown>;
  updateSubmission(id: string, patch: Record<string, string>): Promise<void>;
  audit(row: { submission_id: string; action_type: string; change_summary: string; changes: Record<string, unknown> }): Promise<void>;
  now(): string;
}

export interface HandlerResult { status: number; body: Record<string, unknown> }

const OPEN = ['draft', 'sent'];

export async function handleEsignWebhook(rawBody: string, headers: HeaderBag, deps: WebhookDeps): Promise<HandlerResult> {
  let verified = false;
  try { verified = await deps.provider.verifyWebhook(rawBody, headers); } catch { verified = false; }
  if (!verified) return { status: 401, body: { ok: false, error: 'Invalid signature' } };

  const ev = deps.provider.parseWebhook(rawBody);
  if (ev.event === 'other') return { status: 200, body: { ok: true, ignored: ev.rawType || 'unknown event' } };
  if (!ev.providerDocumentId) return { status: 200, body: { ok: true, ignored: 'no document id' } };

  const doc = await deps.findDocument(deps.provider.name, ev.providerDocumentId);
  // 200 so the provider stops retrying a document this portal does not know (e.g. sent from the SignWell UI).
  if (!doc) return { status: 200, body: { ok: true, skipped: 'unknown document' } };
  if (doc.status === 'signed') return { status: 200, body: { ok: true, skipped: 'already signed' } };

  if (ev.event === 'declined' || ev.event === 'voided') {
    if (doc.status === ev.event) return { status: 200, body: { ok: true, skipped: `already ${ev.event}` } };
    // The SignWell hash covers only type@time, not the document id: confirm with the provider's API before acting.
    if (deps.provider.confirmStatus && (await deps.provider.confirmStatus(ev.providerDocumentId)) !== ev.event) {
      return { status: 200, body: { ok: true, skipped: 'not confirmed by provider' } };
    }
    const changed = await deps.updateDocument(doc.id, OPEN, { status: ev.event });
    if (!changed) return { status: 200, body: { ok: true, skipped: `document is ${doc.status}` } };
    await deps.audit({
      submission_id: doc.submissionId, action_type: `esign_${ev.event}`, change_summary: `Document ${ev.event} by signer`,
      changes: { document_id: doc.id, provider: deps.provider.name, provider_document_id: ev.providerDocumentId, event: ev.rawType ?? ev.event },
    });
    return { status: 200, body: { ok: true, status: ev.event } };
  }

  // signed: the provider must hand over the completed PDF (this also confirms completion independently of the body).
  const bytes = await deps.provider.downloadSignedPdf(ev.providerDocumentId);
  const path = unitDocumentPath(doc.unitNumber, doc.id);
  await deps.uploadPdf(path, bytes);
  const signedAt = deps.now();
  const changed = await deps.updateDocument(doc.id, [...OPEN, 'declined', 'voided'], { status: 'signed', signed_at: signedAt, storage_path: path });
  if (!changed) return { status: 200, body: { ok: true, skipped: 'already signed' } };
  await deps.audit({
    submission_id: doc.submissionId, action_type: 'esign_signed', change_summary: 'Document signed',
    changes: { document_id: doc.id, provider: deps.provider.name, provider_document_id: ev.providerDocumentId, storage_path: path, signed_at: signedAt },
  });

  const target = parseStatusAfterSigned(await deps.statusAfterSignedSetting());
  const patch = statusAdvancePatch(doc.submission, target, signedAt);
  if (patch) await deps.updateSubmission(doc.submissionId, patch);
  return { status: 200, body: { ok: true, status: 'signed', ...(patch ? { submission_status: patch.status } : {}) } };
}
