// Pricing queue (Phase 2 Task 12, spec §6.5): every pending line flagged to a pricer, grouped by assignee, oldest
// first, with its age against the escalation setting. Answers are made inline and saved through useQuoteLines
// (reducer + counted ⇒ visible guard + audit trigger) — this page never writes quote_lines directly.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuoteLines } from '@/hooks/useQuoteLines';
import { usePricingQueueRows } from '@/hooks/usePricingQueue';
import { DEFAULT_ESCALATION_HOURS, SETTINGS_KEYS, parseEscalationHours } from '@shared/pricingQueue';
import { answerPatch, buildQueueViewModel, type Answer, type QueueItem } from '@/lib/pricingQueue';
import { lineAmount } from '@/lib/lineAmount';
import { parseNumber } from '@/components/quote/consoleCells';
import { cn } from '@/lib/utils';

type Outcome = Answer['kind'];
const OUTCOMES: ReadonlyArray<{ value: Outcome; label: string }> = [
  { value: 'price', label: 'Priced — Upgrade' },
  { value: 'included', label: 'Included (no charge)' },
  { value: 'under_review', label: 'Under review' },
  { value: 'deferred', label: 'Deferred' },
];

const money = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

/** Escalation hours are in admin-only portal_settings; staff fall back to the default. */
function useEscalationHours(): number {
  const [hours, setHours] = useState(DEFAULT_ESCALATION_HOURS);
  useEffect(() => {
    void supabase.from('portal_settings' as never).select('value').eq('key', SETTINGS_KEYS.escalationHours).maybeSingle()
      .then(({ data }) => { if (data) setHours(parseEscalationHours((data as { value: unknown }).value)); });
  }, []);
  return hours;
}

function AnswerForm({ item, onDone, onCancel }: { item: QueueItem; onDone: () => void; onCancel: () => void }) {
  const q = useQuoteLines(item.submissionId, { unitLabel: item.unit });
  const line = q.lines.find((l) => l.id === item.lineId);
  const [outcome, setOutcome] = useState<Outcome>('price');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (line?.client_note) setReason((r) => r || line.client_note || ''); }, [line?.client_note]);

  if (q.loading && !line) return <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Loading line…</p>;
  if (q.loadError) return <p role="alert" className="text-sm text-destructive">Could not load the line: {q.loadError}</p>;
  if (!line) return <p className="text-sm text-muted-foreground">This line is no longer on the quote.</p>;
  if (line.status !== 'pending') {
    return <p className="text-sm text-muted-foreground">Already answered — now {line.status.replace('_', ' ')}.</p>;
  }

  const hasQty = typeof line.quantity === 'number';
  const priceNum = parseNumber(unitPrice);
  const preview = hasQty && typeof priceNum === 'number' ? lineAmount(line.quantity, priceNum, null) : null;

  const submit = async () => {
    setError(null);
    let answer: Answer;
    if (outcome === 'price') {
      const p = parseNumber(unitPrice);
      const a = parseNumber(amount);
      if (p === undefined || a === undefined) { setError('Enter numbers only.'); return; }
      answer = hasQty ? { kind: 'price', unitPrice: p, amount: a } : { kind: 'price', amount: a };
    } else if (outcome === 'included') answer = { kind: 'included' };
    else answer = { kind: outcome, reason };

    const r = answerPatch(line, answer);
    if (r.ok === false) { setError(r.reason); return; }
    setSaving(true);
    q.upsert({ id: line.id, ...r.patch });
    await q.flush();
    setSaving(false);
    const s = q.snapshot();
    if (s.isDirty || s.saveState.status === 'error') { setError(s.saveState.error ?? 'Not saved — try again.'); return; }
    toast.success(`${item.unit}: ${item.label} answered`);
    onDone();
  };

  return (
    <form className="mt-3 grid gap-3 rounded-md border border-border bg-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor={`outcome-${item.lineId}`}>Answer</Label>
        <Select value={outcome} onValueChange={(v) => { setOutcome(v as Outcome); setError(null); }}>
          <SelectTrigger id={`outcome-${item.lineId}`}><SelectValue /></SelectTrigger>
          <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {outcome === 'price' && (
        <div className="flex flex-wrap items-end gap-3">
          {hasQty && (
            <div className="grid gap-1.5">
              <Label htmlFor={`price-${item.lineId}`}>Unit price (pre-GST)</Label>
              <Input id={`price-${item.lineId}`} inputMode="decimal" className="w-36" autoFocus value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          )}
          {hasQty && (
            <p className="pb-2 text-sm text-muted-foreground">
              × {line.quantity} {line.unit}{preview != null ? ` = ${money(preview)}` : ''}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`amount-${item.lineId}`}>{hasQty ? 'or flat amount' : 'Amount (pre-GST)'}</Label>
            <Input id={`amount-${item.lineId}`} inputMode="decimal" className="w-36" autoFocus={!hasQty} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
      )}

      {(outcome === 'under_review' || outcome === 'deferred') && (
        <div className="grid gap-1.5">
          <Label htmlFor={`reason-${item.lineId}`}>Reason for the buyer (printed)</Label>
          <Textarea id={`reason-${item.lineId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save answer</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  );
}

export default function AdminPricingQueue() {
  const { user } = useAuth();
  const { rows, loading, error, refresh } = usePricingQueueRows();
  const escalationHours = useEscalationHours();
  const [open, setOpen] = useState<string | null>(null);
  // Re-render each minute so ages and overdue flags stay current.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(t); }, []);

  const vm = useMemo(
    () => buildQueueViewModel(rows, { now, escalationHours, me: user?.id ?? null }),
    [rows, now, escalationHours, user?.id],
  );

  return (
    <AdminLayout>
      <div className="max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-serif">Pricing queue</h1>
          <p className="text-sm text-muted-foreground">
            Pending lines flagged to a pricer. {vm.total} open{vm.overdue ? `, ${vm.overdue} waiting more than ${escalationHours} h` : ''}.
          </p>
        </div>
        {error && (
          <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
            Could not load the queue: {error}
            <Button size="sm" variant="outline" onClick={() => void refresh()}>Retry</Button>
          </div>
        )}
        {loading && <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" />Loading…</p>}
        {!loading && !error && vm.total === 0 && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Nothing waiting for a price.</CardContent></Card>
        )}

        {vm.groups.map((g) => (
          <Card key={g.assigneeId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {g.assigneeName}{g.mine ? ' (you)' : ''}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {g.items.length} open{g.overdue ? ` · ${g.overdue} overdue` : ''}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {g.items.map((it) => (
                  <li key={it.lineId} className="py-3">
                    <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {it.unit}{it.buyer ? ` · ${it.buyer}` : ''}
                          <span className="font-normal text-muted-foreground"> — {it.location ? `${it.location} · ` : ''}{it.label}</span>
                        </p>
                        {it.note && <p className="mt-0.5 text-sm text-muted-foreground">Note: {it.note}</p>}
                      </div>
                      <span className={cn('text-sm tabular-nums', it.overdue ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                        {it.age}{it.overdue ? ' · overdue' : ''}
                      </span>
                      <div className="flex gap-2">
                        <Button asChild size="sm" variant="outline"><Link to={it.href}>Open in console</Link></Button>
                        <Button size="sm" onClick={() => setOpen(open === it.lineId ? null : it.lineId)} aria-expanded={open === it.lineId}>
                          Answer
                        </Button>
                      </div>
                    </div>
                    {open === it.lineId && (
                      <AnswerForm item={it} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); void refresh(); }} />
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
}
