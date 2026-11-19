// Buyer review page body (/my-quote, Phase 2 Task 13, spec §6.7). Presentational: a MyQuoteState in, markup out.
// Rows come from buildLineRows (buyer view) — seven columns plus the buyer's response; totals render only in
// RunningTotal (buyerView), the same function as the PDF. Internal fields never reach this component: the state is
// built from an explicit allow-list (src/lib/myQuoteModel.ts).
import { useState, type FormEvent } from 'react';
import { CheckCircle2, Download, FileText, HelpCircle, MessageSquare } from 'lucide-react';
import { LINE_COLUMNS, type LineRow } from '@/lib/lineRenderRows';
import {
  CHANGE_REQUEST_MAX, REVIEW_COMMENT_MAX, validateChangeRequest, validateReviewComment,
  type LineReview, type MyQuoteState, type ReviewResponse,
} from '@/lib/myQuoteModel';
import { OFFICE_EMAIL } from '@shared/buyerContact';
import { RunningTotal } from '@/components/quote/RunningTotal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface MyQuoteViewProps {
  state: MyQuoteState;
  onReview: (lineId: string, response: ReviewResponse, comment: string | null) => Promise<void> | void;
  onRequestChange: (text: string) => Promise<void> | void;
  onDownload?: (kind: 'pdf' | 'word') => void;
  downloading?: 'pdf' | 'word' | null;
}

function ContactLine({ contact }: { contact: string }) {
  const [before] = contact.split(OFFICE_EMAIL);
  return (
    <p className="text-sm text-muted-foreground">
      {before}<a className="font-medium text-primary underline-offset-2 hover:underline" href={`mailto:${OFFICE_EMAIL}`}>{OFFICE_EMAIL}</a>
    </p>
  );
}

function ReviewBadge({ review }: { review?: LineReview }) {
  if (!review) return null;
  return review.response === 'accepted'
    ? <Badge variant="outline" className="gap-1 border-emerald-600 text-emerald-700"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Accepted</Badge>
    : <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700"><HelpCircle className="h-3 w-3" aria-hidden="true" />Questioned</Badge>;
}

function ReviewControls({ row, review, onReview }: { row: LineRow; review?: LineReview; onReview: MyQuoteViewProps['onReview'] }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = async (response: ReviewResponse) => {
    const v = validateReviewComment(comment);
    if (v.ok === false) { setError(v.reason); return; }
    setSending(true);
    try {
      await onReview(row.key, response, v.comment);
      setComment(''); setOpen(false); setError(null);
    } catch {
      // The page has already told the buyer; keep the comment for a retry.
    } finally {
      setSending(false);
    }
  };
  const id = `review-${row.key}`;
  return (
    <div className="flex min-w-[11rem] flex-col gap-1.5">
      <ReviewBadge review={review} />
      {review?.comment && <p className="text-xs text-muted-foreground">“{review.comment}”</p>}
      <div className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={sending} onClick={() => void send('accepted')}
          aria-label={`Accept ${row.item}`}>Accept</Button>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={sending} onClick={() => void send('questioned')}
          aria-label={`Question ${row.item}`}>Question</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2" aria-expanded={open} aria-controls={id}
          onClick={() => setOpen((o) => !o)} aria-label={`Comment on ${row.item}`}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {open && (
        <div id={id} className="space-y-1">
          <Label htmlFor={`${id}-text`} className="text-xs">Comment (optional) — then Accept or Question</Label>
          <Textarea id={`${id}-text`} rows={2} maxLength={REVIEW_COMMENT_MAX} value={comment}
            onChange={(e) => { setComment(e.target.value); setError(null); }} className="text-sm" />
          <p className="text-[11px] text-muted-foreground">{comment.length}/{REVIEW_COMMENT_MAX}</p>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function LineTable({ title, rows, reviews, onReview, subtotal }: {
  title: string; rows: LineRow[]; reviews: Map<string, LineReview>; onReview: MyQuoteViewProps['onReview']; subtotal?: string;
}) {
  if (!rows.length) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {LINE_COLUMNS.map((c, i) => <th key={c} scope="col" className={`px-3 py-2 font-medium ${i >= 3 && i <= 5 ? 'text-right' : ''}`}>{c}</th>)}
              <th scope="col" className="px-3 py-2 font-medium">Your response</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border align-top">
                <td className="px-3 py-2">{r.location}</td>
                <td className="px-3 py-2">
                  <span className="font-medium">{r.item}</span>
                  {r.clientNote && <span className="mt-0.5 block text-xs italic text-muted-foreground">{r.clientNote}</span>}
                </td>
                <td className="px-3 py-2">{r.product}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.unitPrice}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{r.amount}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2"><ReviewControls row={r} review={reviews.get(r.key)} onReview={onReview} /></td>
              </tr>
            ))}
            {subtotal && (
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={5} className="px-3 py-2 text-right font-medium">{title} subtotal</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{subtotal}</td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChangeRequestBox({ onRequestChange }: { onRequestChange: MyQuoteViewProps['onRequestChange'] }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = validateChangeRequest(text);
    if (v.ok === false) { setError(v.reason); return; }
    setSending(true);
    try {
      await onRequestChange(v.text);
      setText(''); setError(null);
    } catch {
      // The page has already told the buyer; keep their text so they can retry.
    } finally {
      setSending(false);
    }
  };
  return (
    <Card className="p-4">
      <form onSubmit={(e) => void submit(e)} className="space-y-2">
        <Label htmlFor="change-request" className="text-sm font-semibold">Request a change</Label>
        <p className="text-xs text-muted-foreground">Tell us what you would like changed. Your sales representative will price it and update your quote.</p>
        <Textarea id="change-request" rows={3} maxLength={CHANGE_REQUEST_MAX} value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{text.length}/{CHANGE_REQUEST_MAX}</span>
          <Button type="submit" size="sm" disabled={sending}>{sending ? 'Sending…' : 'Send request'}</Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </Card>
  );
}

export function MyQuoteView({ state, onReview, onRequestChange, onDownload, downloading = null }: MyQuoteViewProps) {
  if (state.kind !== 'ready') {
    return (
      <Card className="mx-auto max-w-lg space-y-2 p-6 text-center" role={state.kind === 'empty' ? 'status' : 'alert'}>
        <h2 className="text-lg font-semibold">{state.title}</h2>
        <ContactLine contact={state.contact} />
      </Card>
    );
  }
  const { header, model, reviews, lines, gstRate } = state;
  return (
    <div className="flex items-start gap-6 pb-24 lg:pb-0">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{header ? `Unit ${header.unit_number}` : 'Your quote'}</h2>
            {header && (
              <p className="text-sm text-muted-foreground">
                {`${header.first_name} ${header.last_name}`.trim()}{header.unit_type ? ` · ${header.unit_type}` : ''}
              </p>
            )}
          </div>
          {onDownload && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!!downloading} onClick={() => onDownload('word')}>
                <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{downloading === 'word' ? 'Preparing…' : 'Download Word'}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!!downloading} onClick={() => onDownload('pdf')}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />{downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
              </Button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          This is your live quote. Accept each line or ask a question; your sales representative sees your responses.
        </p>

        <LineTable title="Standard selections (included)" rows={model.standard} reviews={reviews} onReview={onReview} />
        {model.upgrades.bySection.map((g) => (
          <LineTable key={g.section} title={g.title} rows={g.rows} reviews={reviews} onReview={onReview} subtotal={g.subtotalText} />
        ))}
        {model.notInTotal.length > 0 && (
          <div className="space-y-1">
            <LineTable title="Not included in total" rows={model.notInTotal} reviews={reviews} onReview={onReview} />
            <p className="text-xs italic text-muted-foreground">
              Items marked Pending, Under review or Deferred are not yet priced or approved and are not part of the total.
            </p>
          </div>
        )}

        <ChangeRequestBox onRequestChange={onRequestChange} />
        <ContactLine contact={state.contact} />
      </div>
      <RunningTotal lines={lines} gstRate={gstRate} buyerView />
    </div>
  );
}
