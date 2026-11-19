// Console "Send for signature" (Phase 2 Task 14, spec §6.8). Pure orchestration with injected I/O so the order and the
// refusals are unit-tested (scripts/esign-send.test.ts): flush autosave → refuse open lines / unpriced totals → insert
// an immutable quote_snapshot (version = max + 1) → render the BUYER PDF from the snapshot lines → documents row
// (draft) → upload unit-documents/{unit}/{document_id}.pdf → send-for-signature edge function.
// quote_snapshots are INSERT-only: this module (and the whole client) never updates or deletes one.
import { sumQuoteLines, type QuoteLine } from '@/lib/quoteLines';
import { KIND_FOR_PURPOSE, unitDocumentPath, type DocumentKind, type SnapshotPurpose } from '@shared/esign/documents';

export const OPEN_LINE_STATUSES = ['pending', 'under_review'] as const;

export type SnapshotTotals = { subtotal: number; gst: number; total: number };

/** Why a snapshot cannot be taken now, or null. Lines with status 'removed' are ignored. */
export function snapshotRefusal(lines: readonly QuoteLine[], gstRate: number | null | undefined): string | null {
  const live = lines.filter((l) => l.status !== 'removed');
  const open = live.filter((l) => (OPEN_LINE_STATUSES as readonly string[]).includes(l.status));
  if (open.length) {
    const names = open.slice(0, 3).map((l) => [l.location, l.label].filter(Boolean).join(' · ')).join('; ');
    return `${open.length} line${open.length > 1 ? 's are' : ' is'} still pending or under review (${names}${open.length > 3 ? '; …' : ''}). Price or defer ${open.length > 1 ? 'them' : 'it'} first.`;
  }
  const unpriced = live.filter((l) => l.status === 'upgrade' && (l.amount == null || !Number.isFinite(Number(l.amount))));
  if (unpriced.length) return `${unpriced.length} upgrade line${unpriced.length > 1 ? 's have' : ' has'} no amount yet — the total is incomplete.`;
  if (typeof gstRate !== 'number' || !Number.isFinite(gstRate)) return 'Pricing (GST rate) has not loaded — try again in a moment.';
  if (!live.length) return 'There are no lines to send.';
  return null;
}

/** Totals stored on the snapshot; null when they cannot be computed (same rule as snapshotRefusal). */
export function snapshotTotals(lines: readonly QuoteLine[], gstRate: number): SnapshotTotals | null {
  if (snapshotRefusal(lines, gstRate)) return null;
  const s = sumQuoteLines(lines as QuoteLine[], gstRate);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { subtotal: round(s.subtotal), gst: round(s.gst), total: round(s.total) };
}

export const nextSnapshotVersion = (existing: ReadonlyArray<number | null | undefined>): number =>
  existing.reduce<number>((m, v) => (typeof v === 'number' && v > m ? v : m), 0) + 1;

/** The buyer PDF must never carry staff-only text, even though the snapshot's lines jsonb (staff RLS) keeps it. */
export function buyerSafeLines<T extends QuoteLine>(lines: readonly T[]): T[] {
  return lines.map((l) => ({ ...l, internal_note: null }));
}

export interface SnapshotRow { id: string; version: number }

export interface SendDeps {
  /** guardedAction: commit focused cell, flush autosave; ok=false when something is unsaved. */
  flushSaved(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Lines and GST rate read AFTER the flush. */
  current(): { lines: QuoteLine[]; gstRate: number | null | undefined };
  existingVersions(submissionId: string): Promise<number[]>;
  /** INSERT only. Throws { code: '23505' } on a version race. */
  insertSnapshot(row: { submission_id: string; version: number; purpose: SnapshotPurpose; lines: QuoteLine[]; subtotal: number; gst: number; total: number }): Promise<SnapshotRow>;
  renderBuyerPdf(lines: QuoteLine[], gstRate: number, version: number): Promise<Blob>;
  newId(): string;
  insertDocument(row: { id: string; submission_id: string; snapshot_id: string; kind: DocumentKind; status: 'draft'; storage_path: string; signer_email: string | null }): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  upload(path: string, pdf: Blob): Promise<void>;
  sendForSignature(documentId: string): Promise<{ embedded_signing_url: string }>;
}

export type SendResult =
  | { ok: true; documentId: string; snapshot: SnapshotRow; embeddedSigningUrl: string }
  | { ok: false; reason: string; documentId?: string };

const isUniqueViolation = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: unknown }).code === '23505';

export async function sendForSignature(
  input: { submissionId: string; unitNumber: string; buyerEmail: string | null; purpose: SnapshotPurpose },
  deps: SendDeps,
): Promise<SendResult> {
  const saved = await deps.flushSaved();
  if (saved.ok === false) return saved;
  const { lines, gstRate } = deps.current();
  const refused = snapshotRefusal(lines, gstRate);
  if (refused) return { ok: false, reason: refused };
  const rate = gstRate as number;
  const totals = snapshotTotals(lines, rate) as SnapshotTotals;
  const snapshotLines = lines.map((l) => ({ ...l }));

  let snapshot: SnapshotRow | null = null;
  for (let attempt = 0; attempt < 3 && !snapshot; attempt++) {
    const version = nextSnapshotVersion(await deps.existingVersions(input.submissionId));
    try {
      snapshot = await deps.insertSnapshot({ submission_id: input.submissionId, version, purpose: input.purpose, lines: snapshotLines, ...totals });
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 2) throw e;
    }
  }
  if (!snapshot) return { ok: false, reason: 'Could not record the quote snapshot.' };

  const pdf = await deps.renderBuyerPdf(buyerSafeLines(snapshotLines), rate, snapshot.version);
  const documentId = deps.newId();
  const path = unitDocumentPath(input.unitNumber, documentId);
  await deps.insertDocument({
    id: documentId, submission_id: input.submissionId, snapshot_id: snapshot.id, kind: KIND_FOR_PURPOSE[input.purpose],
    status: 'draft', storage_path: path, signer_email: input.buyerEmail,
  });
  try {
    await deps.upload(path, pdf);
  } catch (e) {
    await deps.deleteDocument(documentId).catch(() => undefined);
    throw e;
  }
  const r = await deps.sendForSignature(documentId);
  return { ok: true, documentId, snapshot, embeddedSigningUrl: r.embedded_signing_url };
}
