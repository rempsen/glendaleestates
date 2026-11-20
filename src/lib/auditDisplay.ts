// Pure display helpers for the History tab (src/components/admin/SubmissionAuditLog.tsx); no Supabase import.
/** History badge text per action type (unknown types fall back to the raw name with spaces). */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: 'create',
  update: 'update',
  delete: 'delete',
  status_change: 'status change',
  followups_update: 'follow-ups',
  client_notes_update: 'client note',
};
export const auditActionLabel = (actionType: string): string => AUDIT_ACTION_LABELS[actionType] ?? actionType.replace(/_/g, ' ');

const titleCase = (field: string) => field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * The before → after rows the History tab shows for one audit entry. Most entries store
 * `changes = { [field]: { old, new } }`; `client_notes_update` stores one `{ field, label, from, to }`.
 */
export function auditChangeRows(log: { action_type: string; changes: unknown }): Array<{ key: string; label: string; old: unknown; new: unknown }> {
  const ch = (log.changes && typeof log.changes === 'object' ? log.changes : {}) as Record<string, unknown>;
  if (log.action_type === 'client_notes_update' && typeof ch.field === 'string') {
    const label = typeof ch.label === 'string' && ch.label ? ch.label : titleCase(ch.field);
    return [{ key: ch.field, label: `Client note — ${label}`, old: ch.from ?? null, new: ch.to ?? null }];
  }
  return Object.entries(ch).map(([field, v]) => {
    const c = (v && typeof v === 'object' ? v : {}) as { old?: unknown; new?: unknown };
    return { key: field, label: titleCase(field), old: c.old, new: c.new };
  });
}

const AREA_NOTE_FIELD = /^area_upgrades\[(\d+)\]\.clientComment$/;
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The as-submitted record rebuilt from the change history (logs oldest first): the oldest "before" value of each
 * field wins. Generic rows store `{ [field]: { old, new } }`; `client_notes_update` rows store one
 * `{ field, from, to }`, where `field` is a note column or `area_upgrades[i].clientComment`. An area note's "before"
 * applies on top of the `area_upgrades` base unless a whole-array "before" was logged earlier (which already holds it).
 */
export function originalFromAuditLogs<T extends Record<string, unknown>>(
  current: T, logs: ReadonlyArray<{ action_type?: string | null; changes: unknown }>,
): T {
  const orig: Record<string, unknown> = { ...current };
  const seen = new Set<string>();
  let areaBaseSeenAt = -1; // log position of the oldest whole-array area_upgrades "before"
  const areaNotes = new Map<number, { at: number; from: string | null }>();

  logs.forEach((log, at) => {
    const ch = isPlainObject(log.changes) ? log.changes : {};
    if (log.action_type === 'client_notes_update' && typeof ch.field === 'string') {
      const from = (ch.from ?? null) as string | null;
      const m = AREA_NOTE_FIELD.exec(ch.field);
      if (m) { const i = Number(m[1]); if (!areaNotes.has(i)) areaNotes.set(i, { at, from }); return; }
      if (!seen.has(ch.field)) { seen.add(ch.field); orig[ch.field] = from; }
      return;
    }
    for (const [field, v] of Object.entries(ch)) {
      if (seen.has(field) || !isPlainObject(v) || !('old' in v)) continue;
      seen.add(field);
      orig[field] = v.old;
      if (field === 'area_upgrades') areaBaseSeenAt = at;
    }
  });

  const notesToApply = [...areaNotes].filter(([, n]) => areaBaseSeenAt < 0 || n.at < areaBaseSeenAt);
  if (notesToApply.length && Array.isArray(orig.area_upgrades)) {
    const rows = [...(orig.area_upgrades as unknown[])];
    for (const [i, n] of notesToApply) {
      if (!isPlainObject(rows[i])) continue;
      const row = { ...(rows[i] as Record<string, unknown>) };
      if (n.from === null) delete row.clientComment; else row.clientComment = n.from;
      rows[i] = row;
    }
    orig.area_upgrades = rows;
  }
  return orig as T;
}
