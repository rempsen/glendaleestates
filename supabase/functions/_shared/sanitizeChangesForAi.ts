// Strips staff-only text from submission_audit_logs.changes before it reaches the AI prompt (AGENTS rule 3).
// Removes top-level `sales_comments` ("Admin Notes") and `admin_notes`, and the internal `comments` field on every
// area_upgrades row in both old and new values. Buyer-visible `clientComment` and all other keys are kept.
// quote_lines `internal_note` is removed wherever it appears (top level, inside `old`/`new`, or deeper).
const INTERNAL_TOP_LEVEL = new Set(['sales_comments', 'admin_notes']);

const stripInternalNote = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(stripInternalNote);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'internal_note') continue;
    out[k] = stripInternalNote(val);
  }
  return out;
};

const stripAreaComments = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(row => {
      if (!row || typeof row !== 'object') return row;
      const { comments: _internal, ...keep } = row as Record<string, unknown>;
      return keep;
    })
    : v;

export function sanitizeChangesForAi(changes: unknown): unknown {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return changes;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stripInternalNote(changes) as Record<string, unknown>)) {
    if (INTERNAL_TOP_LEVEL.has(key)) continue;
    if (key === 'area_upgrades' && value && typeof value === 'object' && !Array.isArray(value)) {
      const { old: o, new: n, ...rest } = value as Record<string, unknown>;
      out[key] = { ...rest, old: stripAreaComments(o), new: stripAreaComments(n) };
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function sanitizeAuditLogsForAi<T extends { changes?: unknown }>(logs: T[]): T[] {
  return (Array.isArray(logs) ? logs : []).map(l => ({ ...l, changes: sanitizeChangesForAi(l?.changes) }));
}
