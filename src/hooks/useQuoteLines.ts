// Line data layer for the office console and pricing queue: optimistic edits, 500 ms per-line autosave,
// optimistic-concurrency conflict reload, realtime merge and an awaitable flush().
// Thin glue over quoteLinesReducer (state), quoteLinesApi (request shapes) and SaveScheduler (timing) —
// those three are unit-tested; this file only wires them to supabase and React.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  quoteLinesReducer, initialQuoteLinesState, selectLines, selectIsDirty, fromRow, CONFLICT_MESSAGE,
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

export function useQuoteLines(submissionId: string | null | undefined): UseQuoteLines {
  const stateRef = useRef<QuoteLinesState>(initialQuoteLinesState);
  const [state, setState] = useState<QuoteLinesState>(initialQuoteLinesState);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const subRef = useRef(submissionId);
  subRef.current = submissionId;
  /** Bumped when the submission changes; late acks from an older generation are dropped. */
  const genRef = useRef(0);

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
      // Zero rows matched our updated_at: someone else saved first. Reload just this line.
      const { data: fresh, error: refetchError } = await supabase.from('quote_lines').select('*').eq('id', id).maybeSingle();
      if (refetchError || !fresh) throw new Error(refetchError?.message ?? 'Line no longer available');
      put({ type: 'saveConflict', id, row: fromRow(fresh as QuoteLineRow) });
      toast.warning(CONFLICT_MESSAGE);
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

  // Reset and load when the submission changes. On teardown (submission switch or unmount, e.g. in-app
  // navigation, which beforeunload does not cover) the pending saves are sent first so nothing is dropped.
  useEffect(() => {
    genRef.current += 1;
    stateRef.current = initialQuoteLinesState;
    setState(initialQuoteLinesState);
    if (submissionId) void refresh();
    return () => { void flush(); };
  }, [submissionId, refresh, flush]);

  useEffect(() => () => scheduler.dispose(), [scheduler]);

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
