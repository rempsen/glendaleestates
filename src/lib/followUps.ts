// Follow-ups and basement notes (Phase 2 Task 18 fix round 1, spec §6.10 "Follow-ups" checkboxes).
//
// The ONE writer of `buyer_selections.custom_pricing` (allowlisted in scripts/callers.test.ts). It read-modify-writes
// only `followUps` and `basementNotes`: every other key (`overrides`, `customItems`, `provisional`, …) is copied
// through untouched, because the generator still reads them for every submission without stored lines.
// Concurrency: the write is conditional on the row's `updated_at` (bumped by the update_buyer_selections_updated_at
// trigger); a mismatch reloads instead of overwriting. Every save writes a `followups_update` audit row.
import type { FollowUp } from '@/lib/customPricing';

export const FOLLOWUPS_CONFLICT_MESSAGE = 'Reloaded — someone else edited this quote';

/** The two keys this module may change. */
export interface NotesPatch { followUps?: FollowUp[]; basementNotes?: string }

type Json = Record<string, unknown>;
const asObject = (raw: unknown): Json => (raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Json) : {});

/** The next custom_pricing: the stored object with ONLY the patched keys replaced (all other keys as stored). */
export function applyNotesPatch(raw: unknown, patch: NotesPatch): Json {
  const next: Json = { ...asObject(raw) };
  if (patch.followUps !== undefined) next.followUps = patch.followUps.map((f) => ({ ...f }));
  if (patch.basementNotes !== undefined) {
    const t = patch.basementNotes.trim();
    if (t) next.basementNotes = t; else delete next.basementNotes;
  }
  return next;
}

// ---- Pure list edits (the five console actions) ----

const newId = () => `fu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function addFollowUp(list: FollowUp[], text: string, id: string = newId()): FollowUp[] {
  const t = text.trim();
  return t ? [...list, { id, text: t, done: false, clientVisible: false }] : list;
}
export function editFollowUpText(list: FollowUp[], id: string, text: string): FollowUp[] {
  const t = text.trim();
  if (!t) return list; // an empty edit is ignored; use remove
  return list.map((f) => (f.id === id ? { ...f, text: t } : f));
}
export const toggleFollowUpDone = (list: FollowUp[], id: string): FollowUp[] =>
  list.map((f) => (f.id === id ? { ...f, done: !f.done } : f));
export const toggleFollowUpClient = (list: FollowUp[], id: string): FollowUp[] =>
  list.map((f) => (f.id === id ? { ...f, clientVisible: !f.clientVisible } : f));
export const removeFollowUp = (list: FollowUp[], id: string): FollowUp[] => list.filter((f) => f.id !== id);

// ---- The writer ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null } }> } };

export type SaveNotesResult =
  | { ok: true; custom_pricing: Json; updated_at: string }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: string };

/**
 * Saves follow-ups / basement notes for one submission. `expectedUpdatedAt` is the `updated_at` of the row the
 * console shows; if the stored row moved on, nothing is written and `{ conflict: true }` comes back (reload it).
 */
export async function saveNotes(
  client: Client, submissionId: string, expectedUpdatedAt: string | null | undefined, patch: NotesPatch,
): Promise<SaveNotesResult> {
  const cur = await client.from('buyer_selections').select('custom_pricing, updated_at').eq('id', submissionId).maybeSingle();
  if (cur.error) return { ok: false, conflict: false, error: cur.error.message ?? String(cur.error) };
  if (!cur.data) return { ok: false, conflict: false, error: 'Quote not found' };
  if (expectedUpdatedAt && cur.data.updated_at !== expectedUpdatedAt) return { ok: false, conflict: true };

  const before = asObject(cur.data.custom_pricing);
  const next = applyNotesPatch(before, patch);
  const upd = await client.from('buyer_selections')
    .update({ custom_pricing: next })
    .eq('id', submissionId).eq('updated_at', cur.data.updated_at)
    .select('custom_pricing, updated_at').maybeSingle();
  if (upd.error) return { ok: false, conflict: false, error: upd.error.message ?? String(upd.error) };
  if (!upd.data) return { ok: false, conflict: true };

  const changes: Json = {};
  if (patch.followUps !== undefined) changes['custom_pricing.followUps'] = { old: before.followUps ?? [], new: next.followUps };
  if (patch.basementNotes !== undefined) changes['custom_pricing.basementNotes'] = { old: before.basementNotes ?? null, new: next.basementNotes ?? null };
  const { data: { user } } = await client.auth.getUser();
  const audit = await client.from('submission_audit_logs').insert({
    submission_id: submissionId,
    changed_by_user_id: user?.id ?? null,
    changed_by_email: user?.email ?? null,
    action_type: 'followups_update',
    changes,
    change_summary: patch.followUps !== undefined ? 'Follow-ups updated' : 'Basement notes updated',
  });
  if (audit?.error) console.error('followups audit log failed', audit.error);
  return { ok: true, custom_pricing: asObject(upd.data.custom_pricing), updated_at: String(upd.data.updated_at) };
}
