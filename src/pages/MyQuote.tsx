// Buyer review page /my-quote (Phase 2 Task 13, spec §6.7). Data only; markup lives in MyQuoteView.
// Every read goes through a SECURITY DEFINER RPC matched on the signed-in email (get_my_quote_header,
// get_my_quote_lines) or the buyer's own quote_line_reviews rows (RLS: own + visible line). The page never queries
// quote_lines or buyer_selections. Writes: quote_line_reviews insert (RLS) and request_quote_change() (RPC).
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { MyQuoteView } from '@/components/buyer/MyQuoteView';
import {
  buildMyQuoteState, OFFICE_CONTACT_TEXT,
  type LineReview, type MyQuoteHeader, type MyQuoteRpcLine, type MyQuoteState, type ReviewResponse,
} from '@/lib/myQuoteModel';
import { generateBuyerQuotePdf } from '@/lib/savedSubmissionPdf';
import { downloadBuyerQuoteWord } from '@/lib/submissionWordExport';

interface Loaded { headers: MyQuoteHeader[]; lines: MyQuoteRpcLine[]; reviews: LineReview[] }

async function loadMyQuote(userId: string): Promise<Loaded> {
  const [header, lines, reviews] = await Promise.all([
    supabase.rpc('get_my_quote_header'),
    supabase.rpc('get_my_quote_lines'),
    supabase.from('quote_line_reviews').select('id,line_id,response,comment,created_at').eq('buyer_user_id', userId)
      .order('created_at', { ascending: false }),
  ]);
  for (const r of [header, lines, reviews]) if (r.error) throw r.error;
  return {
    headers: (header.data ?? []) as MyQuoteHeader[],
    lines: (lines.data ?? []) as MyQuoteRpcLine[],
    reviews: (reviews.data ?? []) as LineReview[],
  };
}

export default function MyQuote() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const dyn = useDynamicPricing();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [downloading, setDownloading] = useState<'pdf' | 'word' | null>(null);

  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setData(await loadMyQuote(userId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  // Buyers get no Realtime on quote_lines (no base-table SELECT); pick up staff edits when the tab regains focus.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refresh]);

  const state: MyQuoteState | null = data && dyn.loaded
    ? buildMyQuoteState({ ...data, gstRate: dyn.gstRate })
    : null;

  const onReview = async (lineId: string, response: ReviewResponse, comment: string | null) => {
    if (!user) return;
    const { error } = await supabase.from('quote_line_reviews').insert({ line_id: lineId, buyer_user_id: user.id, response, comment });
    // Throw so ReviewControls keeps the buyer's comment for a retry.
    if (error) { toast.error('Your response was not saved', { description: OFFICE_CONTACT_TEXT }); throw error; }
    toast.success(response === 'accepted' ? 'Accepted — thank you' : 'Question sent to your sales representative');
    await refresh();
  };

  const onRequestChange = async (text: string) => {
    const { error } = await supabase.rpc('request_quote_change', { _text: text });
    if (error) { toast.error('Your request was not sent', { description: OFFICE_CONTACT_TEXT }); throw error; }
    toast.success('Request sent — we will update your quote');
    await refresh();
  };

  const onDownload = (kind: 'pdf' | 'word') => {
    if (state?.kind !== 'ready' || !state.header) return;
    const { header, lines, gstRate } = state;
    setDownloading(kind);
    const run = kind === 'pdf' ? generateBuyerQuotePdf(header, lines, gstRate) : downloadBuyerQuoteWord(header, lines, gstRate);
    void run
      .catch(() => toast.error('Download failed', { description: OFFICE_CONTACT_TEXT }))
      .finally(() => setDownloading(null));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => { void signOut().then(() => navigate('/')); }}>
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden="true" />Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="mb-4 text-2xl font-semibold">My quote</h1>
        {loadError && (
          <div role="alert" className="mb-4 flex items-center gap-3 text-sm text-destructive">
            Your quote could not be loaded. {OFFICE_CONTACT_TEXT}
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button>
          </div>
        )}
        {!state && !loadError && <p className="text-sm text-muted-foreground">Loading your quote…</p>}
        {state && (
          <MyQuoteView
            state={state}
            onReview={onReview}
            onRequestChange={onRequestChange}
            onDownload={state.kind === 'ready' && state.header ? onDownload : undefined}
            downloading={downloading}
          />
        )}
      </main>
    </div>
  );
}
