// Pure request builders for quote_lines writes. The hook turns these into supabase calls; tests assert their shape.
// Removal is a status change (buildUpdate with { status: 'removed' }) — there is deliberately no delete builder.
import { cleanPatch, FORBIDDEN_WRITE_KEYS, reorderPositions, type LinePatch, type StoredLine } from './quoteLinesReducer';

export { FORBIDDEN_WRITE_KEYS };

export interface UpdateRequest {
  table: 'quote_lines';
  /** `updated_at` is the optimistic-concurrency guard: zero rows matched ⇒ someone else saved first. */
  match: { id: string; updated_at: string };
  values: LinePatch;
}

export interface InsertRequest {
  table: 'quote_lines';
  values: LinePatch & { id: string; submission_id: string };
}

export function buildUpdate(id: string, patch: LinePatch, knownUpdatedAt: string): UpdateRequest {
  return {
    table: 'quote_lines',
    match: { id, updated_at: knownUpdatedAt },
    values: cleanPatch(patch as Record<string, unknown>),
  };
}

/** Full insert of a locally created line, keeping its client-generated id. */
export function buildInsert(line: StoredLine): InsertRequest {
  return {
    table: 'quote_lines',
    values: { ...cleanPatch(line as unknown as Record<string, unknown>), id: line.id, submission_id: line.submission_id },
  };
}

/** sort_order updates for a new ordering, (i + 1) * 10 like the generator (sent as per-line guarded updates). */
export const buildReorder = reorderPositions;
