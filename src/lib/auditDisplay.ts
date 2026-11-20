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
