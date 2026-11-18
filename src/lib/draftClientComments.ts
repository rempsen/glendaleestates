/**
 * Drafts saved before the clientComment split hold the buyer's area note in `areaUpgrades[].comments`.
 * Since the wizard is the only writer of drafts, that text is buyer-typed: on draft load move it to
 * `clientComment` and clear `comments` (same eligibility rule as scripts/backfill-client-comments.ts:
 * only rows with `clientComment === undefined` and non-empty `comments`). Idempotent; other keys untouched.
 */
type AreaRow = { comments?: unknown; clientComment?: unknown; [k: string]: unknown };

export function migrateDraftAreaRow<T extends AreaRow>(row: T): T {
  if (!row || typeof row !== 'object') return row;
  if (row.clientComment !== undefined) return row;
  if (typeof row.comments !== 'string' || !row.comments.trim()) return row;
  return { ...row, clientComment: row.comments, comments: '' };
}

export function migrateDraftClientComments<S extends { areaUpgrades?: unknown }>(selections: S): S {
  if (!selections || !Array.isArray(selections.areaUpgrades)) return selections;
  const next = (selections.areaUpgrades as AreaRow[]).map(migrateDraftAreaRow);
  return next.some((r, i) => r !== (selections.areaUpgrades as AreaRow[])[i]) ? { ...selections, areaUpgrades: next } : selections;
}
