// RunningTotal rail (Phase 2 Task 4, spec §6.16): the one place totals are shown on screen.
// Presentational: props in, markup out. All numbers come from buildRunningTotalModel -> sumQuoteLines.
import { useState } from 'react';
import { ChevronUp } from 'lucide-react';
import type { QuoteLine } from '@/lib/quoteLines';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { buildRunningTotalModel, type RunningTotalModel } from './runningTotalModel';

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; at?: Date };

export interface RunningTotalProps {
  lines: QuoteLine[];
  gstRate: number;
  buyerView: boolean;
  saveState?: SaveState;
  onRetry?: () => void;
  /** 'auto' renders the desktop aside (lg+) and the mobile bar (< lg); the others force one (tests, embeds). */
  variant?: 'auto' | 'desktop' | 'mobile';
  /** Height of the sticky page header; the desktop aside fills the viewport below it. */
  headerHeight?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const formatSavedAt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function SaveIndicator({ state, onRetry }: { state?: SaveState; onRetry?: () => void }) {
  if (!state || state.status === 'idle') return null;
  if (state.status === 'saving') return <p className="text-xs text-muted-foreground">Saving…</p>;
  if (state.status === 'saved') {
    return <p className="text-xs text-muted-foreground">Saved ✓{state.at ? ` ${formatSavedAt(state.at)}` : ''}</p>;
  }
  return (
    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-destructive" onClick={onRetry}>
      Save failed — retry
    </Button>
  );
}

function RailBody({ model, saveState, onRetry }: { model: RunningTotalModel; saveState?: SaveState; onRetry?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {model.counted.length === 0 && model.notInTotal.length === 0 && (
            <p className="text-sm text-muted-foreground">No upgrades selected yet.</p>
          )}
          {model.counted.length > 0 && (
            <ul className="space-y-2" aria-label="Included in total">
              {model.counted.map((c) => (
                <li key={c.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-xs text-muted-foreground">{c.location}</span>
                    <span className="block break-words">{c.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-medium">{c.amountText}</span>
                </li>
              ))}
            </ul>
          )}
          {model.notInTotal.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not included in total</h3>
              <ul className="space-y-2">
                {model.notInTotal.map((n) => (
                  <li key={n.key} className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
                    <span className="min-w-0">
                      <span className="block text-xs">{n.location}</span>
                      <span className="block break-words">{n.label}</span>
                      <Badge variant="outline" className="mt-1 text-[10px]">{n.statusLabel}</Badge>
                    </span>
                    <span className="shrink-0 tabular-nums">{n.amountText}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-border bg-muted/40 p-4" aria-live="polite" aria-label="Totals">
        <dl className="space-y-1 text-sm">
          {model.rows.map((r) => (
            <div
              key={r.label}
              className={r.label === 'Total' ? 'flex justify-between border-t border-border pt-2 text-base font-semibold' : 'flex justify-between'}
            >
              <dt>{r.label}</dt>
              <dd className="tabular-nums">{r.amountText}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 min-h-4"><SaveIndicator state={saveState} onRetry={onRetry} /></div>
      </div>
    </div>
  );
}

export function RunningTotal({
  lines, gstRate, buyerView, saveState, onRetry, variant = 'auto', headerHeight = '4rem',
}: RunningTotalProps) {
  const model = buildRunningTotalModel(lines, gstRate, { buyerView });
  const total = model.rows[model.rows.length - 1].amountText;
  const [open, setOpen] = useState(false);

  const desktop = (
    <aside
      aria-label="Running total"
      className={variant === 'auto' ? 'hidden lg:block' : 'block'}
      style={{ width: 320, flex: '0 0 320px' }}
    >
      <Card
        className="sticky overflow-hidden"
        style={{ top: headerHeight, height: `calc(100vh - ${headerHeight})` }}
      >
        <RailBody model={model} saveState={saveState} onRetry={onRetry} />
      </Card>
    </aside>
  );

  const mobile = (
    <div className={variant === 'auto' ? 'lg:hidden' : undefined}>
      <Sheet open={open} onOpenChange={setOpen}>
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background shadow-lg">
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              aria-label="Open running total"
            >
              <span className="text-base font-semibold" aria-live="polite">Total {total}</span>
              <ChevronUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </button>
          </SheetTrigger>
        </div>
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col p-0">
          <SheetHeader className="p-4 pb-0 text-left">
            <SheetTitle>Running total</SheetTitle>
            <SheetDescription className="sr-only">Selections that count toward the total, and those that do not.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1"><RailBody model={model} saveState={saveState} onRetry={onRetry} /></div>
        </SheetContent>
      </Sheet>
    </div>
  );

  if (variant === 'desktop') return desktop;
  if (variant === 'mobile') return mobile;
  return <>{desktop}{mobile}</>;
}
