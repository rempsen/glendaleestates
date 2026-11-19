// Pricing queue data (Phase 2 Task 12, spec §6.5): rows of the staff-only `pricing_queue` view, refreshed through
// Supabase Realtime on quote_lines (publication supabase_realtime includes it, migration 0008). Read-only: answers
// are written by useQuoteLines in the page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { QueueRow } from '@shared/pricingQueue';

const REFETCH_DEBOUNCE_MS = 400;

/** Calls `onChange` (debounced) whenever any quote line changes. One channel per caller. */
function useQuoteLinesChanged(onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const channel = supabase
      .channel(`pricing-queue-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_lines' }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => cb.current(), REFETCH_DEBOUNCE_MS);
      })
      .subscribe();
    return () => { window.clearTimeout(timer); supabase.removeChannel(channel); };
  }, [enabled]);
}

/** Open pricing requests for the nav badge; null until known (or for non-staff, where the view returns nothing). */
export function usePricingQueueCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  const load = useCallback(async () => {
    const { count: n, error } = await supabase.from('pricing_queue').select('line_id', { count: 'exact', head: true });
    if (!error) setCount(n ?? 0);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useQuoteLinesChanged(() => { void load(); });
  return count;
}

export function usePricingQueueRows() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('pricing_queue')
      .select('line_id,submission_id,unit_number,first_name,last_name,section,location,label,internal_note,flagged_to,assignee_email,assignee_first_name,assignee_last_name,flagged_at')
      .order('flagged_at', { ascending: true });
    setLoading(false);
    if (e) { setError(e.message); return; }
    setError(null);
    setRows((data ?? []).filter((r) => r.line_id && r.submission_id) as QueueRow[]);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useQuoteLinesChanged(() => { void refresh(); });
  return { rows, loading, error, refresh };
}
