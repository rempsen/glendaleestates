// Task 16 fix round 1: report the rows a bulk delete actually removed. RLS (buyer_selections DELETE is admin-only)
// silently deletes 0 rows instead of erroring, so the toast must count the returned ids, never the selection.
export interface BulkDeleteOutcome {
  deletedIds: Set<string>;
  kind: 'success' | 'partial' | 'none';
  message: string;
}

export function summarizeBulkDelete(requestedIds: readonly string[], returned: ReadonlyArray<{ id: string }> | null): BulkDeleteOutcome {
  const deletedIds = new Set((returned ?? []).map((r) => r.id).filter((id) => requestedIds.includes(id)));
  const n = deletedIds.size;
  if (n === 0) return { deletedIds, kind: 'none', message: 'No submissions were deleted (admin access required)' };
  if (n < requestedIds.length) {
    return { deletedIds, kind: 'partial', message: `Deleted ${n} of ${requestedIds.length} submission(s); the rest could not be deleted` };
  }
  return { deletedIds, kind: 'success', message: `Deleted ${n} submission(s)` };
}
