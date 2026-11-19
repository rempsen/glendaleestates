// Pure rules shared by the console (DocumentsPanel / send flow) and the esign edge functions (spec §6.8).

export const UNIT_DOCUMENTS_BUCKET = 'unit-documents';

export const DOCUMENT_KINDS = ['selection_sheet', 'change_order', 'purchase_agreement', 'deposit_receipt', 'other'] as const;
export type DocumentKind = typeof DOCUMENT_KINDS[number];
export const DOCUMENT_STATUSES = ['draft', 'sent', 'signed', 'declined', 'voided'] as const;
export type DocumentStatus = typeof DOCUMENT_STATUSES[number];
export type SnapshotPurpose = 'quote' | 'change_order' | 'contract';

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  selection_sheet: 'Selection sheet',
  change_order: 'Change order',
  purchase_agreement: 'Purchase agreement',
  deposit_receipt: 'Deposit receipt',
  other: 'Other',
};

/** The document kind a snapshot of this purpose is sent as. */
export const KIND_FOR_PURPOSE: Record<SnapshotPurpose, DocumentKind> = {
  quote: 'selection_sheet',
  change_order: 'change_order',
  contract: 'purchase_agreement',
};

export const isDocumentKind = (v: unknown): v is DocumentKind => typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

/** Unit numbers become a storage folder: keep them to a safe charset. */
export function safeUnitFolder(unit: string | null | undefined): string {
  const s = String(unit ?? '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'unknown-unit';
}

/** `unit-documents/{unit_number}/{document_id}.pdf` (path inside the bucket). */
export function unitDocumentPath(unit: string | null | undefined, documentId: string): string {
  if (!isUuid(documentId)) throw new Error('document id must be a uuid');
  return `${safeUnitFolder(unit)}/${documentId.toLowerCase()}.pdf`;
}

export function documentTitle(unit: string | null | undefined, kind: string): string {
  const label = isDocumentKind(kind) ? DOCUMENT_KIND_LABELS[kind] : kind;
  return `Glendale Estates — Unit ${String(unit ?? '').trim() || '—'} — ${label}`;
}

export const ESIGN_SETTINGS_KEYS = { provider: 'esign_provider', statusAfterSigned: 'esign_status_after_signed' } as const;
export const DEFAULT_ESIGN_PROVIDER = 'signwell';

/**
 * buyer_selections.status workflow (StatusWorkflowControl): submitted → reviewed → quoted → completed. The original
 * CHECK allows draft/submitted/reviewed/completed and the app also writes 'quoted'; 'signed' is not a status.
 */
export const BUYER_STATUS_ORDER = ['draft', 'submitted', 'reviewed', 'quoted', 'completed'] as const;
export const DEFAULT_STATUS_AFTER_SIGNED = 'completed';
const ADVANCE_TARGETS = ['reviewed', 'quoted', 'completed'];

/** Setting value → target status, or null (= do not change the submission). JSON null or unknown values → null. */
export function parseStatusAfterSigned(value: unknown): string | null {
  const v = typeof value === 'string' ? value.trim() : value === undefined ? DEFAULT_STATUS_AFTER_SIGNED : null;
  return v && ADVANCE_TARGETS.includes(v) ? v : null;
}

export function parseEsignProvider(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : DEFAULT_ESIGN_PROVIDER;
}

/**
 * The buyer_selections patch after signing: status only moves forward (a 'completed' unit is never pulled back to
 * 'quoted'); the matching workflow timestamps are stamped when still empty. null = nothing to change.
 */
export function statusAdvancePatch(
  current: { status: string | null; reviewed_at?: string | null; quoted_at?: string | null; completed_at?: string | null },
  target: string | null,
  nowIso: string,
): Record<string, string> | null {
  if (!target) return null;
  const rank = (s: string | null) => BUYER_STATUS_ORDER.indexOf((s ?? 'submitted') as typeof BUYER_STATUS_ORDER[number]);
  const to = rank(target);
  if (to < 0 || to <= rank(current.status)) return null;
  const patch: Record<string, string> = { status: target };
  if (to >= rank('reviewed') && !current.reviewed_at) patch.reviewed_at = nowIso;
  if (to >= rank('quoted') && !current.quoted_at) patch.quoted_at = nowIso;
  if (to >= rank('completed') && !current.completed_at) patch.completed_at = nowIso;
  return patch;
}
