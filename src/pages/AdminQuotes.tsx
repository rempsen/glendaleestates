import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { pushRecent, rankQuotes, readRecents, type QuoteRow } from '@/lib/quoteSearch';

const STATUSES = ['draft', 'submitted', 'reviewed', 'quoted', 'completed'] as const;

const statusColors: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  reviewed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  quoted: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

const store = () => (typeof window === 'undefined' ? null : window.localStorage);

export default function AdminQuotes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [recents, setRecents] = useState<string[]>(() => readRecents(store()));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('id, unit_number, first_name, last_name, email, status, updated_at')
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      if (error) toast.error('Failed to load quotes', { description: error.message });
      setRows((data || []) as QuoteRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounce typing so ranking runs at most every 150 ms.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 150);
    return () => clearTimeout(t);
  }, [input]);

  const filtered = useMemo(
    () => (status === 'all' ? rows : rows.filter((r) => r.status === status)),
    [rows, status],
  );
  const results = useMemo(() => rankQuotes(filtered, query, recents), [filtered, query, recents]);
  const recentRows = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    return recents.map((id) => byId.get(id)).filter((r): r is QuoteRow => !!r);
  }, [rows, recents]);

  const open = (id: string) => {
    setRecents(pushRecent(store(), id));
    navigate(`/admin/quotes/${id}`);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Quotes</h1>
          <p className="text-muted-foreground">Search by unit number, buyer last name, or email.</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Unit, last name, or email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) open(results[0].id);
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {['all', ...STATUSES].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? 'default' : 'outline'}
              onClick={() => setStatus(s)}
              className="capitalize"
            >
              {s === 'all' ? 'All' : s}
            </Button>
          ))}
        </div>

        {!query.trim() && recentRows.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Recent</h2>
            <div className="flex flex-wrap gap-2">
              {recentRows.map((r) => (
                <Button key={r.id} size="sm" variant="secondary" onClick={() => open(r.id)}>
                  {r.unit_number} · {r.last_name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {loading ? (
            <p className="text-muted-foreground">Loading quotes…</p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground">No quotes match.</p>
          ) : (
            results.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-4 p-3">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">
                      {r.unit_number} · {r.first_name} {r.last_name}
                    </span>
                    <span className="ml-2 text-muted-foreground">{r.email}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge className={statusColors[r.status] || statusColors.draft}>{r.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(r.updated_at), 'MMM d, yyyy')}
                    </span>
                    <Button size="sm" onClick={() => open(r.id)}>Open</Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
