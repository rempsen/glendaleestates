// Line data layer for the office console and pricing queue: optimistic edits, 500 ms per-line autosave,
// optimistic-concurrency conflict reload, realtime merge and an awaitable flush().
// Thin glue over quoteLinesReducer (state), quoteLinesApi (request shapes) and SaveScheduler (timing) —
// those three are unit-tested; this file only wires them to supabase and React.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  quoteLinesReducer, initialQuoteLinesState, selectLines, selectIsDirty, fromRow, sameUpdatedAt,
  conflictMessage, describeUnsaved,
  type QuoteLinesAction, type QuoteLinesState, type StoredLine, type LinePatch, type QuoteLineRow, type SaveState,
} from '@/lib/quoteLinesReducer';
import { buildInsert, buildUpdate, buildReorder } from '@/lib/quoteLinesApi';
import { SaveScheduler } from '@/lib/saveScheduler';

export const AUTOSAVE_DELAY_MS = 500;

/** Fields a caller supplies to create a line; identity, ordering and server columns are filled in. */
export type NewLineInput = Omit<LinePatch, 'sort_order'> & Pick<StoredLine, 'section' | 'label'> & { sort_order?: number };

export interface UseQuoteLines {
  lines: StoredLine[];
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  isDirty: boolean;
  /** Edit an existing line (by `id`) or create one when the id is unknown / absent. Returns the line id. */
  upsert: (line: Partial<StoredLine>) => string;
  createLine: (input: NewLineInput) => string;
  /** Sets status 'removed' (never a DELETE). */
  remove: (id: string) => void;
  reorder: (ids: string[]) => void;
  /** Resolves once every pending and in-flight save has settled. */
  flush: () => Promise<void>;
  refresh: () => Promise<void>;
}

const LINE_DEFAULTS = {
  location: '', unit: 'each', pricing_mode: 'manual', status: 'upgrade', client_visible: true,
  source: 'office', provisional: false,
} as const;

const newId = () => crypto.randomUUID();

export interface UseQuoteLinesOptions {
  /** Shown in error toasts, e.g. "Unit 204", so staff know which unit did not save. */
  unitLabel?: string;
}

export const NOT_PERMITTED_MESSAGE = 'Save was not permitted';

export function useQuoteLines(submissionId: string | null | undefined, opts: UseQuoteLinesOptions = {}): UseQuoteLines {
  const stateRef = useRef<QuoteLinesState>(initialQuoteLinesState);
  const [state, setState] = useState<QuoteLinesState>(initialQuoteLinesState);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const subRef = useRef(submissionId);
  subRef.current = submissionId;
  /** Bumped when the submission changes; late acks from an older generation are dropped. */
  const genRef = useRef(0);
  const unitLabelRef = useRef(opts.unitLabel);
  unitLabelRef.current = opts.unitLabel;
  /** Submission (and its label) whose lines are currently in stateRef. */
  const heldRef = useRef<{ sid: string | null | undefined; unitLabel?: string }>({ sid: null });
  /** Flush of the outgoing submission; the next submission is loaded only after it settles. */
  const outgoingRef = useRef<Promise<void>>(Promise.resolve());

  // Synchronous store so async save callbacks always read the latest state.
  const dispatch = useCallback((action: QuoteLinesAction, gen: number = genRef.current) => {
    if (gen !== genRef.current) return;
    const next = quoteLinesReducer(stateRef.current, action);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const send = useCallback(async (id: string) => {
    const s = stateRef.current;
    const line = s.lines[id];
    if (!line || s.inflight[id]) return;
    const pending = s.pendingIds.includes(id);
    const patch = s.dirty[id];
    if (!pending && (!patch || !Object.keys(patch).length)) return;

    const gen = genRef.current;
    const put = (a: QuoteLinesAction) => dispatch(a, gen);
    put({ type: 'saveStart', ids: [id] });
    const restore = patch ? { [id]: patch } : undefined;
    try {
      if (pending) {
        const req = buildInsert(line);
        const { data, error } = await supabase.from(req.table).insert(req.values as never).select().single();
        if (error || !data) throw new Error(error?.message ?? 'Insert returned no row');
        put({ type: 'saveOk', id, row: fromRow(data as QuoteLineRow), at: new Date() });
        return;
      }
      const req = buildUpdate(id, patch, line.updated_at);
      const { data, error } = await supabase
        .from(req.table)
        .update(req.values as never)
        .eq('id', req.match.id)
        .eq('updated_at', req.match.updated_at)
        .select()
        .single();
      if (data && !error) {
        put({ type: 'saveOk', id, row: fromRow(data as QuoteLineRow), at: new Date() });
        return;
      }
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      // Zero rows matched. Either someone else saved first (updated_at moved) or RLS denied the UPDATE
      // (updated_at unchanged). Reload just this line to tell the two apart.
      const { data: fresh, error: refetchError } = await supabase.from('quote_lines').select('*').eq('id', id).maybeSingle();
      if (refetchError || !fresh) throw new Error(refetchError?.message ?? 'Line no longer available');
      const freshRow = fromRow(fresh as QuoteLineRow);
      if (sameUpdatedAt(freshRow.updated_at, req.match.updated_at)) throw new Error(NOT_PERMITTED_MESSAGE);
      put({ type: 'saveConflict', id, row: freshRow, sent: patch });
      if (gen === genRef.current) {
        const dropped = stateRef.current.lastConflict?.id === id ? stateRef.current.lastConflict.dropped : (patch ?? {});
        toast.warning(conflictMessage(dropped), { duration: Infinity });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      put({ type: 'saveError', ids: [id], message, patches: restore });
      toast.error('Could not save line', { description: message });
    }
  }, [dispatch]);

  const scheduler = useMemo(() => new SaveScheduler({ delayMs: AUTOSAVE_DELAY_MS, send }), [send]);

  /** Starts every pending save now (synchronously reading current state); returns when all have settled. */
  const flush = useCallback(async () => {
    const s = stateRef.current;
    await scheduler.flush([...Object.keys(s.dirty), ...s.pendingIds.filter((id) => !s.inflight[id])]);
  }, [scheduler]);

  const refresh = useCallback(async () => {
    const sid = subRef.current;
    if (!sid) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('quote_lines').select('*').eq('submission_id', sid).order('sort_order', { ascending: true });
    if (subRef.current !== sid) return; // submission changed while loading
    setLoading(false);
    if (error) { setLoadError(error.message); return; }
    setLoadError(null);
    dispatch({ type: 'loaded', rows: (data ?? []).map((r) => fromRow(r as QuoteLineRow)) });
  }, [dispatch]);

  /**
   * Sends everything pending for the submission currently held, awaiting queued follow-ups too. If anything
   * is still unsaved afterwards, it is named in an error toast with the unit, because the state is about to
   * be dropped.
   */
  const flushOutgoing = useCallback(async () => {
    const held = heldRef.current;
    await flush();
    if (heldRef.current.sid !== held.sid) return;
    const s = stateRef.current;
    if (!selectIsDirty(s)) return;
    const unsaved = describeUnsaved(s);
    const unit = held.unitLabel ?? 'this submission';
    toast.error(`${unit}: ${unsaved.length} line${unsaved.length === 1 ? '' : 's'} did not save`, {
      description: `${s.saveState.error ? `${s.saveState.error}. ` : ''}${unsaved.join('; ')}`,
      duration: Infinity,
    });
  }, [flush]);

  // Reset and load when the submission changes. On teardown (submission switch or unmount, e.g. in-app
  // navigation, which beforeunload does not cover) the outgoing submission's saves are flushed FIRST —
  // including follow-ups queued behind an in-flight save — and only then is the state reset and the
  // generation bumped (late responses for the old generation are ignored after that).
  useEffect(() => {
    let cancelled = false;
    setLoading(!!submissionId);
    void outgoingRef.current.then(() => {
      if (cancelled) return;
      genRef.current += 1;
      heldRef.current = { sid: submissionId, unitLabel: unitLabelRef.current };
      stateRef.current = initialQuoteLinesState;
      setState(initialQuoteLinesState);
      if (submissionId) void refresh();
    });
    return () => {
      cancelled = true;
      outgoingRef.current = outgoingRef.current.then(flushOutgoing, flushOutgoing);
    };
  }, [submissionId, refresh, flushOutgoing]);

  // Keep the label of the held submission current (callers may resolve it after the first render).
  useEffect(() => {
    if (heldRef.current.sid === submissionId) heldRef.current = { sid: submissionId, unitLabel: opts.unitLabel };
  }, [submissionId, opts.unitLabel]);

  // Dispose only after a final flush has drained (flush awaits queued follow-ups), so nothing is cleared unsent.
  useEffect(() => () => {
    void outgoingRef.current.then(() => flush()).finally(() => scheduler.dispose());
  }, [scheduler, flush]);

  // Realtime: merge INSERT/UPDATE from other sources; the reducer ignores dirty/in-flight lines and our own echoes.
  useEffect(() => {
    if (!submissionId) return;
    const channel = supabase
      .channel(`quote-lines-${submissionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quote_lines', filter: `submission_id=eq.${submissionId}` },
        (payload) => {
          if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
          const row = payload.new as QuoteLineRow;
          if (row?.id) dispatch({ type: 'remoteChange', row: fromRow(row) });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [submissionId, dispatch]);

  const isDirty = selectIsDirty(state);

  // No silent data loss on navigation.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const createLine = useCallback((input: NewLineInput): string => {
    const sid = subRef.current;
    if (!sid) throw new Error('useQuoteLines: no submission');
    const s = stateRef.current;
    const maxOrder = Object.values(s.lines).reduce((m, l) => Math.max(m, l.sort_order), 0);
    const id = newId();
    const line = {
      ...LINE_DEFAULTS,
      ...input,
      sort_order: input.sort_order ?? maxOrder + 10,
      id,
      submission_id: sid,
      updated_at: '',
    } as StoredLine;
    dispatch({ type: 'createLocal', line });
    scheduler.schedule(id);
    return id;
  }, [dispatch, scheduler]);

  const upsert = useCallback((line: Partial<StoredLine>): string => {
    const { id, ...rest } = line;
    if (id && stateRef.current.lines[id]) {
      dispatch({ type: 'edit', id, patch: rest as LinePatch });
      if (stateRef.current.dirty[id]) scheduler.schedule(id);
      return id;
    }
    return createLine(rest as NewLineInput);
  }, [dispatch, scheduler, createLine]);

  const remove = useCallback((id: string) => {
    dispatch({ type: 'remove', id });
    if (stateRef.current.lines[id]) scheduler.schedule(id);
    else scheduler.cancel(id); // local-only line dropped
  }, [dispatch, scheduler]);

  const reorder = useCallback((ids: string[]) => {
    const before = stateRef.current;
    dispatch({ type: 'reorder', ids });
    for (const { id, sort_order } of buildReorder(stateRef.current.order)) {
      if (before.lines[id] && before.lines[id].sort_order !== sort_order) scheduler.schedule(id);
    }
  }, [dispatch, scheduler]);

  const lines = useMemo(() => selectLines(state), [state]);

  return { lines, loading, loadError, saveState: state.saveState, isDirty, upsert, createLine, remove, reorder, flush, refresh };
}
