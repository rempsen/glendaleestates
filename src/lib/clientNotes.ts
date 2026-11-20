// Client-facing notes: exactly what prints under "Your Comments & Notes" on the buyer PDF.
//
// One definition (`clientNoteEntries`) shared by the PDF renderer and the staff "Client-facing notes" panel, and one
// narrow writer (`saveClientNotes`). The writer may change ONLY the six scalar comment columns and, inside
// `area_upgrades`, ONLY `clientComment` (read-modify-write on a freshly read row: every other key and row is copied
// through untouched). It never touches `custom_pricing`, pricing fields, `sales_comments`, `admin_notes` or area
// `comments` (internal). Concurrency mirrors src/lib/followUps.ts: the write is conditional on `updated_at`, a
// mismatch throws `ClientNotesConflictError` (reload instead of overwrite). Every changed field writes one
// `client_notes_update` audit row with `changes = { field, label, from, to }` (buyer-visible text only).
import { AREA_DEFINITIONS } from '@/lib/upgradeCostData';
import { toBuyerWording } from '@/lib/outputLabels';
import { clientAreaNotes } from '@/lib/areaNotes';

/** The six scalar columns, in PDF order, with the labels the PDF prints. */
export const CLIENT_NOTE_FIELDS = [
  { key: 'lvp_comments', label: 'Main Floor LVP' },
  { key: 'spc_tile_comments', label: 'Bathroom Tile' },
  { key: 'window_comments', label: 'Window Coverings' },
  { key: 'backsplash_grout_comments', label: 'Backsplash Grout' },
  { key: 'upgrade_interests_notes', label: 'Upgrade Interests' },
  { key: 'upgrade_comments', label: 'Upgrade Pricing Summary' },
] as const;

export type ClientNoteKey = (typeof CLIENT_NOTE_FIELDS)[number]['key'];
export const CLIENT_NOTE_KEYS: readonly ClientNoteKey[] = CLIENT_NOTE_FIELDS.map((f) => f.key);
/** Every column `saveClientNotes` may write. Anything else is refused (guarded by scripts/client-notes.test.ts). */
export const CLIENT_NOTE_COLUMNS = [...CLIENT_NOTE_KEYS, 'area_upgrades'] as const;
export const isClientNoteKey = (k: string): k is ClientNoteKey => (CLIENT_NOTE_KEYS as readonly string[]).includes(k);
export const clientNoteLabel = (key: ClientNoteKey): string => CLIENT_NOTE_FIELDS.find((f) => f.key === key)!.label;

/** The row fields the notes are read from (a `buyer_selections` row or the editor state). */
export type ClientNoteSource = Partial<Record<ClientNoteKey, string | null>> & { area_upgrades?: unknown };

export type ClientNoteEntry =
  | { kind: 'field'; key: ClientNoteKey; label: string; text: string }
  | { kind: 'area'; index: number; areaId: string; label: string; text: string };

/** The PDF's label for an area-upgrade note (the original row index numbers unspecified areas). */
export function areaNoteLabel(areaId: string, index: number): string {
  const def = AREA_DEFINITIONS.find((a) => a.id === areaId);
  if (def) return `Area Upgrade — ${toBuyerWording(def.name)}`;
  if (!areaId || areaId.startsWith('unspecified_area')) return `Area Upgrade — Unspecified Area #${index + 1}`;
  return `Area Upgrade — ${areaId}`;
}

type AreaRow = { areaId?: string; clientComment?: string | null };
const areaRows = (raw: unknown): AreaRow[] =>
  (Array.isArray(raw) ? raw : []).map((u) => (u && typeof u === 'object' ? (u as AreaRow) : {}));

/**
 * The client-facing notes in PDF order. By default exactly the rows the PDF prints (non-empty scalars as stored,
 * non-blank area `clientComment`s, trimmed). `includeEmpty` lists every scalar and one row per area upgrade, for
 * editing.
 */
export function clientNoteEntries(row: ClientNoteSource, opts: { includeEmpty?: boolean } = {}): ClientNoteEntry[] {
  const out: ClientNoteEntry[] = [];
  for (const { key, label } of CLIENT_NOTE_FIELDS) {
    const text = row[key] ?? '';
    if (text || opts.includeEmpty) out.push({ kind: 'field', key, label, text });
  }
  const rows = areaRows(row.area_upgrades);
  if (opts.includeEmpty) {
    rows.forEach((u, index) => {
      const areaId = u.areaId || '';
      out.push({ kind: 'area', index, areaId, label: areaNoteLabel(areaId, index), text: String(u.clientComment ?? '') });
    });
  } else {
    for (const n of clientAreaNotes(rows)) {
      out.push({ kind: 'area', index: n.index, areaId: n.areaId, label: areaNoteLabel(n.areaId, n.index), text: n.text });
    }
  }
  return out;
}

/** The PDF's camelCase selections → the row shape `clientNoteEntries` reads. */
export function clientNoteSourceFromSelections(s: {
  lvpComments?: string | null; spcTileComments?: string | null; windowComments?: string | null;
  backsplashGrout?: { comments?: string | null } | null; upgradeInterestsNotes?: string | null;
  upgradeComments?: string | null; areaUpgrades?: unknown;
}): ClientNoteSource {
  return {
    lvp_comments: s.lvpComments ?? null,
    spc_tile_comments: s.spcTileComments ?? null,
    window_comments: s.windowComments ?? null,
    backsplash_grout_comments: s.backsplashGrout?.comments ?? null,
    upgrade_interests_notes: s.upgradeInterestsNotes ?? null,
    upgrade_comments: s.upgradeComments ?? null,
    area_upgrades: s.areaUpgrades,
  };
}

type Json = unknown;

/**
 * The next `area_upgrades`: row `index` gets `clientComment = text` (trimmed); every other key of that row and every
 * other row are kept as they are (same objects). A blank note on a row without the key adds nothing.
 */
export function applyAreaClientComment(areaUpgrades: unknown, index: number, text: string): Json {
  if (!Array.isArray(areaUpgrades)) throw new Error('area_upgrades is not a list');
  if (!Number.isInteger(index) || index < 0 || index >= areaUpgrades.length) throw new Error(`No area upgrade at row ${index}`);
  const row = areaUpgrades[index];
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Area upgrade row ${index} is not an object`);
  const t = text.trim();
  const cur = row as Record<string, unknown>;
  if (!('clientComment' in cur) && !t) return areaUpgrades.slice();
  return areaUpgrades.map((r, i) => (i === index ? { ...cur, clientComment: t } : r));
}

// ---- The writer ----

export const CLIENT_NOTES_CONFLICT_MESSAGE = 'Reloaded — someone else edited this quote';
export class ClientNotesConflictError extends Error {
  constructor() { super(CLIENT_NOTES_CONFLICT_MESSAGE); this.name = 'ClientNotesConflictError'; }
}
export const isClientNotesConflict = (e: unknown): e is ClientNotesConflictError =>
  e instanceof ClientNotesConflictError || (e instanceof Error && e.name === 'ClientNotesConflictError');

export interface ClientNotesPatch {
  fields?: Partial<Record<ClientNoteKey, string | null>>;
  /** `areaId`, when given, must still be the area at `index` on the stored row (else conflict). */
  areas?: Array<{ index: number; text: string; areaId?: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null } }> } };

export interface SaveClientNotesResult {
  updated_at: string;
  /** The stored client-note columns after the save. */
  values: ClientNoteSource;
  /** Fields that changed (`area_upgrades[i].clientComment` for area rows). */
  changed: string[];
}

const SELECT = [...CLIENT_NOTE_COLUMNS, 'updated_at'].join(', ');
const normalise = (v: string | null | undefined): string | null => { const t = (v ?? '').trim(); return t ? t : null; };

/**
 * Saves client-facing notes for one submission. `expectedUpdatedAt` is the `updated_at` of the row the caller shows;
 * if the stored row moved on, nothing is written and `ClientNotesConflictError` is thrown (reload it).
 */
export async function saveClientNotes(
  client: Client, submissionId: string, patch: ClientNotesPatch, expectedUpdatedAt: string | null | undefined,
): Promise<SaveClientNotesResult> {
  const cur = await client.from('buyer_selections').select(SELECT).eq('id', submissionId).maybeSingle();
  if (cur.error) throw new Error(cur.error.message ?? String(cur.error));
  if (!cur.data) throw new Error('Quote not found');
  const stored = cur.data as ClientNoteSource & { updated_at: string };
  if (expectedUpdatedAt && stored.updated_at !== expectedUpdatedAt) throw new ClientNotesConflictError();

  const update: Record<string, unknown> = {};
  const audits: Array<{ field: string; label: string; from: string | null; to: string | null }> = [];

  for (const [key, value] of Object.entries(patch.fields ?? {})) {
    if (!isClientNoteKey(key)) throw new Error(`Not a client-facing note: ${key}`);
    const next = normalise(value);
    const before = stored[key] ?? null;
    if (normalise(before) === next) continue;
    update[key] = next;
    audits.push({ field: key, label: clientNoteLabel(key), from: before, to: next });
  }

  let areas: unknown = stored.area_upgrades;
  for (const a of patch.areas ?? []) {
    const rows = areaRows(areas);
    const row = rows[a.index];
    if (a.areaId !== undefined && (row?.areaId ?? '') !== a.areaId) throw new ClientNotesConflictError();
    const before = String(row?.clientComment ?? '');
    if (before.trim() === a.text.trim()) continue;
    areas = applyAreaClientComment(areas, a.index, a.text);
    update.area_upgrades = areas;
    audits.push({
      field: `area_upgrades[${a.index}].clientComment`, label: areaNoteLabel(row?.areaId || '', a.index),
      from: before.trim() || null, to: a.text.trim() || null,
    });
  }

  // Belt and braces: the payload can only name the enumerated columns.
  const stray = Object.keys(update).filter((k) => !(CLIENT_NOTE_COLUMNS as readonly string[]).includes(k));
  if (stray.length) throw new Error(`saveClientNotes refused columns: ${stray.join(', ')}`);

  if (!audits.length) return { updated_at: stored.updated_at, values: pickValues(stored), changed: [] };

  const upd = await client.from('buyer_selections')
    .update(update)
    .eq('id', submissionId).eq('updated_at', stored.updated_at)
    .select(SELECT).maybeSingle();
  if (upd.error) throw new Error(upd.error.message ?? String(upd.error));
  if (!upd.data) throw new ClientNotesConflictError();

  const { data: { user } } = await client.auth.getUser();
  const audit = await client.from('submission_audit_logs').insert(audits.map((c) => ({
    submission_id: submissionId,
    changed_by_user_id: user?.id ?? null,
    changed_by_email: user?.email ?? null,
    action_type: 'client_notes_update',
    changes: c,
    change_summary: `Client note updated: ${c.label}`,
  })));
  if (audit?.error) console.error('client notes audit log failed', audit.error);

  const saved = upd.data as ClientNoteSource & { updated_at: string };
  return { updated_at: String(saved.updated_at), values: pickValues(saved), changed: audits.map((c) => c.field) };
}

function pickValues(row: ClientNoteSource): ClientNoteSource {
  const out: ClientNoteSource = {};
  for (const k of CLIENT_NOTE_KEYS) out[k] = row[k] ?? null;
  out.area_upgrades = row.area_upgrades;
  return out;
}

// ---- Console "Edit buyer details" (SubmissionEditor buyerDetailsOnly) ----

/** Area rows whose client note draft differs from the saved row (by index; carries the areaId for the stale check). */
export function areaClientCommentEdits(saved: unknown, drafts: readonly string[]): Array<{ index: number; areaId: string; text: string }> {
  return areaRows(saved).flatMap((u, index) => {
    const draft = drafts[index];
    if (draft === undefined || draft.trim() === String(u.clientComment ?? '').trim()) return [];
    return [{ index, areaId: u.areaId || '', text: draft }];
  });
}

/**
 * Saves the buyer-details dialog: the non-pricing payload (built with `buyerDetailsOnly`, so it never carries
 * `area_upgrades`) and then any area `clientComment` edits through `saveClientNotes`, conditional on the
 * `updated_at` the payload write returned. Only `clientComment` changes inside `area_upgrades` reach the database.
 */
export async function saveBuyerDetailsEdit(
  client: Client, submissionId: string, payload: Record<string, unknown>,
  areaEdits: Array<{ index: number; areaId: string; text: string }>,
): Promise<{ updated_at: string | null; area_upgrades?: unknown }> {
  if ('area_upgrades' in payload || 'custom_pricing' in payload) throw new Error('buyer details payload may not carry area_upgrades or custom_pricing');
  const upd = await client.from('buyer_selections').update(payload).eq('id', submissionId).select('updated_at').maybeSingle();
  if (upd.error) throw new Error(upd.error.message ?? String(upd.error));
  if (!upd.data) throw new Error('Quote not found');
  const updatedAt: string | null = upd.data.updated_at ?? null;
  if (!areaEdits.length) return { updated_at: updatedAt };
  const r = await saveClientNotes(client, submissionId, { areas: areaEdits }, updatedAt);
  return { updated_at: r.updated_at, area_upgrades: r.values.area_upgrades };
}
