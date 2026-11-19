// Pure state machine behind useQuoteLines: optimistic edits, save acks, conflict reloads and realtime merges.
// No I/O, no clocks (callers pass `at`), no price arithmetic — amounts are whatever the user or server says.
import type { QuoteLine } from '@shared/quoteLines';
import type { Database } from '@/integrations/supabase/types';

export type QuoteLineRow = Database['public']['Tables']['quote_lines']['Row'];

/** A line as held in the client: the shared QuoteLine plus the identity / concurrency columns. */
export type StoredLine = QuoteLine & {
  id: string;
  submission_id: string;
  /** Server timestamp the next UPDATE must match; '' for a local line not yet inserted. */
  updated_at: string;
} & Partial<Pick<QuoteLineRow,
  'created_at' | 'created_by' | 'updated_by' | 'flagged_at' | 'answered_at' | 'answered_by' | 'counts_in_total'>>;

/** Columns the client must never write: identity, generated (`counts_in_total`), trigger-owned timestamps, audit-only. */
export const FORBIDDEN_WRITE_KEYS = [
  'id', 'submission_id', 'created_at', 'updated_at', 'counts_in_total', 'internal_note_changed', 'updated_by',
] as const;

export type LinePatch = Partial<Omit<StoredLine, 'id' | 'submission_id' | 'updated_at' | 'created_at' | 'counts_in_total'>>;

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; at?: Date; error?: string };

export interface QuoteLinesState {
  lines: Record<string, StoredLine>;
  order: string[];
  /** Local edits not yet sent (includes edits made while a save of the same id is in flight). */
  dirty: Record<string, LinePatch>;
  inflight: Record<string, true>;
  saveState: SaveState;
  /** Lines created locally that the server has not acknowledged yet (next save is an INSERT). */
  pendingIds: string[];
  /** The most recent conflict reload and the local changes it discarded (sent patch + edits queued behind it). */
  lastConflict: { id: string; dropped: LinePatch } | null;
}

export const CONFLICT_MESSAGE = 'Reloaded — someone else edited this line';

/** Shown as a toast when an edit would leave a counted line hidden from the buyer (migration 0010 enforces it too). */
export const COUNTED_HIDDEN_REASON = 'A priced line must be visible to the buyer — set it to Under review or Deferred instead';

/**
 * Invariant counted ⇒ client_visible (controller ruling, Task 10 fix round 1): a line that counts in the total
 * (status 'upgrade' with an amount) must be visible, or the buyer's signed Total would differ from the staff total.
 * Returns the refusal reason when `patch` applied to `cur` (null for a new line) would break it, else null.
 */
export function countedHiddenRefusal(cur: Partial<QuoteLine> | null | undefined, patch: Partial<QuoteLine>): string | null {
  const next = { ...(cur ?? {}), ...patch };
  return next.status === 'upgrade' && next.amount != null && next.client_visible === false ? COUNTED_HIDDEN_REASON : null;
}

export type QuoteLinesAction =
  | { type: 'loaded'; rows: StoredLine[] }
  | { type: 'edit'; id: string; patch: LinePatch }
  | { type: 'createLocal'; line: StoredLine }
  | { type: 'remove'; id: string }
  | { type: 'reorder'; ids: string[] }
  | { type: 'saveStart'; ids: string[] }
  | { type: 'saveOk'; id: string; row: StoredLine; at: Date }
  /** `sent` is the patch that was in flight (the reducer no longer holds it after saveStart). */
  | { type: 'saveConflict'; id: string; row: StoredLine; sent?: LinePatch }
  | { type: 'saveError'; ids: string[]; message: string; patches?: Record<string, LinePatch> }
  | { type: 'remoteChange'; row: StoredLine };

export const initialQuoteLinesState: QuoteLinesState = {
  lines: {}, order: [], dirty: {}, inflight: {}, saveState: { status: 'idle' }, pendingIds: [], lastConflict: null,
};

/** DB row → StoredLine (narrows the string columns to the shared unions; nullable location → ''). */
export function fromRow(row: QuoteLineRow): StoredLine {
  return { ...row, location: row.location ?? '' } as unknown as StoredLine;
}

/** Removes forbidden keys and undefined values from a patch. */
export function cleanPatch(patch: Record<string, unknown>): LinePatch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || (FORBIDDEN_WRITE_KEYS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out as LinePatch;
}

const without = <T>(rec: Record<string, T>, id: string): Record<string, T> => {
  if (!(id in rec)) return rec;
  const next = { ...rec };
  delete next[id];
  return next;
};

/** sort_order for an ordering: (i + 1) * 10, like the generator. */
export function reorderPositions(ids: string[]): { id: string; sort_order: number }[] {
  return ids.map((id, i) => ({ id, sort_order: (i + 1) * 10 }));
}

/** Stable sort of ids by sort_order, ties keep their previous relative order. */
function sortIds(ids: string[], lines: Record<string, StoredLine>): string[] {
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => (lines[a.id].sort_order - lines[b.id].sort_order) || (a.i - b.i))
    .map((x) => x.id);
}

function ts(s: string | undefined): number {
  const n = s ? Date.parse(s) : NaN;
  return Number.isNaN(n) ? -Infinity : n;
}

/** Same server instant? Exact string match, or equal when parsed (realtime and PostgREST may format differently). */
export function sameUpdatedAt(a: string | undefined, b: string | undefined): boolean {
  return a === b || (!!a && !!b && ts(a) === ts(b));
}

export function quoteLinesReducer(state: QuoteLinesState, action: QuoteLinesAction): QuoteLinesState {
  switch (action.type) {
    case 'loaded': {
      const lines: Record<string, StoredLine> = {};
      for (const r of action.rows) {
        const local = state.lines[r.id];
        if (state.inflight[r.id] && local) lines[r.id] = local;
        else if (state.dirty[r.id] && local) {
          // Keep the updated_at our pending edit was based on, so its guarded UPDATE still detects a
          // concurrent edit (a refresh must not re-base the patch onto someone else's newer row).
          lines[r.id] = { ...r, ...state.dirty[r.id], updated_at: local.updated_at } as StoredLine;
        } else lines[r.id] = r;
      }
      for (const id of state.pendingIds) if (state.lines[id] && !lines[id]) lines[id] = state.lines[id];
      const known = state.order.filter((id) => id in lines);
      const fresh = Object.keys(lines).filter((id) => !known.includes(id));
      const dirty = Object.fromEntries(Object.entries(state.dirty).filter(([id]) => id in lines));
      return { ...state, lines, dirty, order: sortIds([...known, ...fresh], lines) };
    }

    case 'edit': {
      const cur = state.lines[action.id];
      if (!cur) return state;
      const patch = cleanPatch(action.patch as Record<string, unknown>);
      if (countedHiddenRefusal(cur, patch)) return state; // refused; useQuoteLines shows COUNTED_HIDDEN_REASON
      const changed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if ((cur as unknown as Record<string, unknown>)[k] !== v) changed[k] = v;
      }
      if (!Object.keys(changed).length) return state;
      const reordered = 'sort_order' in changed;
      const lines = { ...state.lines, [action.id]: { ...cur, ...changed } as StoredLine };
      return {
        ...state,
        lines,
        dirty: { ...state.dirty, [action.id]: { ...(state.dirty[action.id] ?? {}), ...changed } as LinePatch },
        order: reordered ? sortIds(state.order, lines) : state.order,
      };
    }

    case 'createLocal': {
      const line = action.line;
      if (state.lines[line.id]) return state;
      if (countedHiddenRefusal(null, line)) return state;
      const lines = { ...state.lines, [line.id]: line };
      return {
        ...state,
        lines,
        order: sortIds([...state.order, line.id], lines),
        pendingIds: [...state.pendingIds, line.id],
      };
    }

    case 'remove': {
      const cur = state.lines[action.id];
      if (!cur) return state;
      // Never inserted and not being inserted: nothing exists server-side, so drop it locally.
      if (state.pendingIds.includes(action.id) && !state.inflight[action.id]) {
        return {
          ...state,
          lines: without(state.lines, action.id),
          dirty: without(state.dirty, action.id),
          order: state.order.filter((id) => id !== action.id),
          pendingIds: state.pendingIds.filter((id) => id !== action.id),
        };
      }
      return quoteLinesReducer(state, { type: 'edit', id: action.id, patch: { status: 'removed' } });
    }

    case 'reorder': {
      const ids = action.ids.filter((id) => id in state.lines);
      const rest = state.order.filter((id) => !ids.includes(id));
      const full = [...ids, ...rest];
      let next = state;
      for (const { id, sort_order } of reorderPositions(full)) {
        next = quoteLinesReducer(next, { type: 'edit', id, patch: { sort_order } });
      }
      return { ...next, order: full };
    }

    case 'saveStart': {
      let dirty = state.dirty;
      const inflight = { ...state.inflight };
      for (const id of action.ids) { dirty = without(dirty, id); inflight[id] = true; }
      return { ...state, dirty, inflight, saveState: { status: 'saving' } };
    }

    case 'saveOk': {
      const id = action.id;
      const queued = state.dirty[id] ?? {};
      const inflight = without(state.inflight, id);
      const lines = { ...state.lines, [id]: { ...action.row, ...queued } as StoredLine };
      const settled = !Object.keys(inflight).length;
      return {
        ...state,
        lines,
        inflight,
        order: sortIds(state.order.includes(id) ? state.order : [...state.order, id], lines),
        pendingIds: state.pendingIds.filter((p) => p !== id),
        saveState: settled
          ? (state.saveState.status === 'error' ? state.saveState : { status: 'saved', at: action.at })
          : state.saveState,
      };
    }

    case 'saveConflict': {
      // Adopt the other user's row wholesale; drop our conflicting patch and anything queued behind it.
      const id = action.id;
      const lines = { ...state.lines, [id]: action.row };
      const dropped = { ...(action.sent ?? {}), ...(state.dirty[id] ?? {}) } as LinePatch;
      return {
        ...state,
        lines,
        dirty: without(state.dirty, id),
        inflight: without(state.inflight, id),
        order: sortIds(state.order, lines),
        saveState: { status: 'error', error: CONFLICT_MESSAGE },
        lastConflict: { id, dropped },
      };
    }

    case 'saveError': {
      let inflight = state.inflight;
      const dirty = { ...state.dirty };
      for (const id of action.ids) {
        inflight = without(inflight, id);
        const failed = action.patches?.[id];
        if (failed && state.lines[id]) dirty[id] = { ...failed, ...(dirty[id] ?? {}) };
      }
      return { ...state, inflight, dirty, saveState: { status: 'error', error: action.message } };
    }

    case 'remoteChange': {
      const row = action.row;
      const id = row.id;
      if (state.dirty[id] || state.inflight[id]) return state;
      const cur = state.lines[id];
      if (cur && (sameUpdatedAt(cur.updated_at, row.updated_at) || ts(row.updated_at) < ts(cur.updated_at))) return state;
      const lines = { ...state.lines, [id]: row };
      return {
        ...state,
        lines,
        order: sortIds(cur ? state.order : [...state.order, id], lines),
        pendingIds: state.pendingIds.filter((p) => p !== id),
      };
    }
  }
}

/** Ordered, visible lines (removed lines excluded). */
export function selectLines(state: QuoteLinesState): StoredLine[] {
  return state.order.map((id) => state.lines[id]).filter((l) => l && l.status !== 'removed');
}

/** True while anything is unsaved: dirty patches, in-flight saves or un-inserted local lines. */
export function selectIsDirty(state: QuoteLinesState): boolean {
  return Object.keys(state.dirty).length > 0
    || Object.keys(state.inflight).length > 0
    || state.pendingIds.length > 0;
}

/** `label → "Premium underpad", quantity → 44` — the fields and values of a patch, for user-facing messages. */
export function describePatch(patch: LinePatch): string {
  return Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k} → ${JSON.stringify(v)}`)
    .join(', ');
}

/** Toast text for a conflict reload: names every local change that was discarded so nothing vanishes silently. */
export function conflictMessage(dropped: LinePatch): string {
  const desc = describePatch(dropped);
  return desc ? `${CONFLICT_MESSAGE}. Your unsaved changes: ${desc}` : CONFLICT_MESSAGE;
}

/** Lines with unsaved work (dirty, in flight or never inserted), labelled for a user-facing message. */
export function describeUnsaved(state: QuoteLinesState): string[] {
  const ids = new Set([...Object.keys(state.dirty), ...Object.keys(state.inflight), ...state.pendingIds]);
  return state.order.filter((id) => ids.has(id)).map((id) => {
    const l = state.lines[id];
    const patch = state.dirty[id];
    const what = l.location ? `${l.label} (${l.location})` : l.label;
    return patch && Object.keys(patch).length ? `${what}: ${describePatch(patch)}` : what;
  });
}
