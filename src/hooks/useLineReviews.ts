// Latest buyer response per line for the meeting console (Phase 2 Task 13, spec §6.7). Staff read quote_line_reviews
// under "Staff manage quote line reviews" (migration 0006). Kept apart from useQuoteLines so line editing is untouched.
// Refreshes when the window regains focus (quote_line_reviews is not in the Realtime publication yet).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { latestReviewByLine, type LineReview } from '@/lib/myQuoteModel';

export function useLineReviews(submissionId: string | undefined): Map<string, LineReview> {
  const [reviews, setReviews] = useState<Map<string, LineReview>>(new Map());
  const load = useCallback(async () => {
    if (!submissionId) return;
    const { data, error } = await supabase
      .from('quote_line_reviews')
      .select('id,line_id,response,comment,created_at,quote_lines!inner(submission_id)')
      .eq('quote_lines.submission_id', submissionId)
      .order('created_at', { ascending: false });
    if (error) return; // the column simply stays empty
    setReviews(latestReviewByLine((data ?? []).map(({ quote_lines: _l, ...r }) => r as LineReview)));
  }, [submissionId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!submissionId) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [submissionId, load]);
  return reviews;
}
