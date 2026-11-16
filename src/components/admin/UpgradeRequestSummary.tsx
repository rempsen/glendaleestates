import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Staff-only AI summary of a buyer's upgrade requests and recent changes.
export function UpgradeRequestSummary({ submissionId }: { submissionId: string }) {
  const [summary, setSummary] = useState('');
  const [at, setAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('summarize-upgrade-requests', { body: { submissionId } });
    setLoading(false);
    const msg = (data as { error?: string })?.error;
    if (error || msg) { toast.error('Could not summarize', { description: msg || 'Please try again.' }); return; }
    setSummary((data as { summary: string }).summary);
    setAt((data as { generatedAt: string }).generatedAt);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h4 className="font-medium">Upgrade Request Summary</h4>
        </div>
        <Button size="sm" variant={summary ? 'outline' : 'default'} onClick={run} disabled={loading}>
          {loading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : summary ? <RefreshCw className="w-4 h-4 mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
          {loading ? 'Summarizing…' : summary ? 'Refresh' : 'Summarize requests'}
        </Button>
      </div>
      {summary ? (
        <>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary.replace(/\*\*/g, '')}</div>
          <p className="text-xs text-muted-foreground">AI-generated {at ? new Date(at).toLocaleString() : ''} — staff only. Check against the record before quoting.</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Get a quick summary of new and current upgrade requests, including lower-level stair carpet and underpad additions.</p>
      )}
    </div>
  );
}
