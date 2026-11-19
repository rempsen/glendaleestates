// One quote line in the meeting console: every field edits inline and autosaves through useQuoteLines.
// Keyboard: Tab moves between cells, Enter commits and moves to the next cell, Esc cancels the cell, ⌘/Ctrl+S saves.
// The only arithmetic is lineAmount, reached through the pure patches in src/lib/lineEdits.ts.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, MoreVertical, NotebookPen, Trash2 } from 'lucide-react';
import type { LineStatus, LineUnit } from '@/lib/quoteLines';
import type { LinePatch, StoredLine } from '@/lib/quoteLinesReducer';
import type { PresetPerson } from '@/lib/addLinePresets';
import { priceEditPatch, clientNoteEdit, provisionalEdit, type EditResult } from '@/lib/lineEdits';
import { toast } from 'sonner';
import { formatMoney, PENDING_TEXT } from '@/components/quote/runningTotalModel';
import { StatusSelect } from '@/components/quote/StatusSelect';
import { UNIT_OPTIONS, focusNextCell, isSaveKey, lineAnchor, parseNumber } from '@/components/quote/consoleCells';
import { BuyerResponseCell } from '@/components/quote/BuyerResponseCell';
import type { LineReview } from '@/lib/myQuoteModel';

const NO_ONE = '__none';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface CellProps {
  value: string;
  /** Return false to reject the draft (it reverts). */
  onCommit: (draft: string) => boolean | void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  numeric?: boolean;
  disabled?: boolean;
}

/** An input that keeps a local draft, commits on blur / Enter / ⌘S, and reverts on Esc. */
export function EditableCell({ value, onCommit, ariaLabel, placeholder, className, multiline, numeric, disabled }: CellProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const cancelled = useRef(false);
  const lastCommitted = useRef<string | null>(null);

  useEffect(() => { if (!focused.current) setDraft(value); }, [value]);

  const commit = () => {
    if (draft === value || draft === lastCommitted.current) return;
    lastCommitted.current = draft;
    if (onCommit(draft) === false) { setDraft(value); lastCommitted.current = null; }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (isSaveKey(e)) { commit(); return; } // the page-level handler flushes after this
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelled.current = true;
      setDraft(value);
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
      focusNextCell(e.currentTarget);
    }
  };
  const common = {
    'data-console-cell': true,
    'aria-label': ariaLabel,
    placeholder,
    disabled,
    value: draft,
    onFocus: () => { focused.current = true; lastCommitted.current = null; },
    onBlur: () => {
      focused.current = false;
      if (cancelled.current) { cancelled.current = false; return; }
      commit();
    },
    onKeyDown,
  };
  return multiline
    ? <Textarea {...common} rows={2} className={cn('min-h-[2.5rem] text-sm', className)} onChange={(e) => setDraft(e.target.value)} />
    : (
      <Input
        {...common}
        inputMode={numeric ? 'decimal' : undefined}
        className={cn('h-9 text-sm', numeric && 'text-right tabular-nums', className)}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
}

const numText = (n: number | null | undefined) => (n == null ? '' : String(n));
const has = (n: number | null | undefined) => typeof n === 'number' && Number.isFinite(n);

export interface LineRowProps {
  line: StoredLine;
  people: PresetPerson[];
  onPatch: (patch: LinePatch) => void;
  /** Routed through validateStatusChange (and the reason prompt) by the page. */
  onStatusChange: (to: LineStatus) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Latest buyer response (/my-quote), shown in the narrow Buyer column. */
  review?: LineReview;
}

export function LineRow({ line, people, onPatch, onStatusChange, onRemove, onMove, canMoveUp, canMoveDown, review }: LineRowProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const included = line.status === 'included';
  const pending = line.status === 'pending';
  const computed = has(line.quantity) && has(line.unit_price);
  const flagged = line.flagged_to ? people.find((p) => p.user_id === line.flagged_to) : undefined;
  const noteCount = (line.client_note ? 1 : 0) + (line.internal_note ? 1 : 0);

  const text = (key: 'location' | 'label' | 'product_name' | 'product_colour', required = false) => (draft: string) => {
    const v = draft.trim();
    if (required && !v) return false;
    onPatch({ [key]: key === 'location' || key === 'label' ? v : v || null } as LinePatch);
  };
  const apply = (r: EditResult) => {
    if (r.ok === false) { toast.error(r.reason); return false; }
    onPatch(r.patch);
    return true;
  };
  const priceEdit = (field: 'quantity' | 'unit_price' | 'amount') => (draft: string) => {
    const n = parseNumber(draft);
    if (n === undefined) return false;
    return apply(priceEditPatch(line, { [field]: n } as { quantity: number | null }));
  };
  const setClientNote = (draft: string) => apply(clientNoteEdit(line, draft));
  const setInternalNote = (draft: string) => { onPatch({ internal_note: draft.trim() || null }); };

  return (
    <li
      id={lineAnchor(line.id)}
      className={cn(
        'scroll-mt-24 rounded-md border border-border bg-background p-2 pl-3 border-l-4 transition-shadow',
        line.status === 'upgrade' && 'border-l-primary',
        included && 'border-l-muted-foreground/30',
        (line.status === 'pending' || line.status === 'under_review') && 'border-l-amber-500',
        line.status === 'deferred' && 'border-l-muted-foreground/60',
      )}
      aria-label={`${line.location || 'Line'} — ${line.label}`}
    >
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,9rem)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <EditableCell value={line.location} onCommit={text('location')} ariaLabel="Location" placeholder="Location" />
        <EditableCell value={line.label} onCommit={text('label', true)} ariaLabel="Item" placeholder="Item" className="font-medium" />
        <EditableCell value={line.product_name ?? ''} onCommit={text('product_name')} ariaLabel="Product" placeholder="Product" />
        <EditableCell value={line.product_colour ?? ''} onCommit={text('product_colour')} ariaLabel="Colour" placeholder="Colour" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 justify-self-end" aria-label="Line actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setNotesOpen((o) => !o)}><NotebookPen className="mr-2 h-4 w-4" />Notes</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}><ArrowUp className="mr-2 h-4 w-4" />Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}><ArrowDown className="mr-2 h-4 w-4" />Move down</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onRemove}>
              <Trash2 className="mr-2 h-4 w-4" />Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <EditableCell value={numText(line.quantity)} onCommit={priceEdit('quantity')} ariaLabel="Quantity" placeholder="Qty" numeric className="w-[4.5rem]" disabled={included} />
        <Select value={line.unit} onValueChange={(v) => onPatch({ unit: v as LineUnit })} disabled={included}>
          <SelectTrigger data-console-cell aria-label="Unit" className="h-9 w-[5.5rem]"><SelectValue /></SelectTrigger>
          <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
        </Select>
        <EditableCell
          value={numText(line.unit_price)} onCommit={priceEdit('unit_price')} ariaLabel="Unit price" placeholder="Unit price"
          numeric className="w-[6.5rem]" disabled={included}
        />
        {computed || included || pending ? (
          <span className="w-[7rem] text-right text-sm font-medium tabular-nums" aria-label="Amount">
            {included ? 'Included' : pending || line.amount == null ? PENDING_TEXT : formatMoney(line.amount)}
          </span>
        ) : (
          <EditableCell
            value={numText(line.amount)} onCommit={priceEdit('amount')} ariaLabel="Amount" placeholder={PENDING_TEXT}
            numeric className="w-[7rem] font-medium"
          />
        )}
        <StatusSelect value={line.status} onChange={onStatusChange} className="w-[8.5rem]" />
        <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox
            data-console-cell
            checked={line.client_visible}
            onCheckedChange={(c) => onPatch({ client_visible: c === true })}
            aria-label="Visible to buyer"
          />
          Visible
        </label>
        <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground" title="Provisional — clear once the buyer has chosen">
          <Checkbox
            data-console-cell
            checked={!!line.provisional}
            onCheckedChange={(c) => { const r = provisionalEdit(line, c === true); if (r.ok === true && Object.keys(r.patch).length) onPatch(r.patch); }}
            aria-label="Provisional"
          />
          Provisional
        </label>
        <Select
          value={line.flagged_to ?? NO_ONE}
          onValueChange={(v) => onPatch({ flagged_to: v === NO_ONE ? null : v })}
        >
          <SelectTrigger data-console-cell aria-label="Flag to" className="h-9 w-[8.5rem]">
            <SelectValue placeholder="Flag to">{line.flagged_to ? (flagged?.name ?? 'Assigned') : 'Flag to —'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ONE}>No one</SelectItem>
            {people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <BuyerResponseCell review={review} />
        <Button
          type="button" variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground"
          aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}
        >
          <NotebookPen className="mr-1 h-3.5 w-3.5" />Notes{noteCount ? ` (${noteCount})` : ''}
        </Button>
      </div>

      {!notesOpen && noteCount > 0 && (
        <div className="mt-1 space-y-0.5 text-xs">
          {line.client_note && <p className="text-muted-foreground"><span className="font-medium">Client:</span> {line.client_note}</p>}
          {line.internal_note && (
            <p className="text-amber-800 dark:text-amber-300"><span className="font-medium">Internal — never printed:</span> {line.internal_note}</p>
          )}
        </div>
      )}
      {notesOpen && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Client note — printed for the buyer</p>
            <EditableCell multiline value={line.client_note ?? ''} onCommit={setClientNote} ariaLabel="Client note" />
          </div>
          <div className="rounded-md bg-amber-50 p-1.5 dark:bg-amber-950/40">
            <p className="mb-1 text-xs font-semibold text-amber-800 dark:text-amber-300">Internal — never printed</p>
            <EditableCell
              multiline value={line.internal_note ?? ''} onCommit={setInternalNote} ariaLabel="Internal note (never printed)"
              className="border-amber-300 bg-amber-50 dark:bg-amber-950/40"
            />
          </div>
        </div>
      )}
    </li>
  );
}
