import type React from 'react';
// Meeting console header: unit · buyer · type · possession · status, and the output actions.
import { ArrowLeft, ChevronDown, Eye, FileDown, FileText, PenLine, UserPen } from 'lucide-react';
import { OUTPUT_ACTIONS, type OutputAction } from '@/lib/consoleActions';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface ConsoleHeaderProps {
  unitNumber: string | null;
  buyerName: string;
  unitType: string | null;
  possession: string | null;
  status: string | null;
  /** The action currently running (its button shows a busy label); all actions disable meanwhile. */
  busy: OutputAction | null;
  /** Lines loading or not loaded: outputs are disabled. */
  outputsDisabled: boolean;
  onBack: () => void;
  onAction: (action: OutputAction) => void;
  onEditBuyer: () => void;
}

export function ConsoleHeader(p: ConsoleHeaderProps) {
  const off = p.outputsDisabled || p.busy !== null;
  const facts = [p.buyerName, p.unitType, p.possession ? `Possession ${p.possession}` : null].filter(Boolean);
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={p.onBack} aria-label="Back to quotes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight">Unit {p.unitNumber ?? '…'}</h1>
          <p className="truncate text-sm text-muted-foreground">
            {facts.join(' · ')}
            {p.status && <Badge variant="secondary" className="ml-2 align-middle capitalize">{p.status}</Badge>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={off} onClick={() => p.onAction('preview')}>
            <Eye className="mr-1.5 h-4 w-4" />{p.busy === 'preview' ? 'Preparing…' : label('preview')}
          </Button>
          <OutputMenu kind="word" icon={<FileText className="mr-1.5 h-4 w-4" />} busy={p.busy} onAction={p.onAction} off={off} />
          <OutputMenu kind="pdf" icon={<FileDown className="mr-1.5 h-4 w-4" />} busy={p.busy} onAction={p.onAction} off={off} />
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button variant="outline" size="sm" disabled className="pointer-events-none">
                  <PenLine className="mr-1.5 h-4 w-4" />Send for signature
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Phase 2 Task 14</TooltipContent>
          </Tooltip>
          <Button variant="secondary" size="sm" onClick={p.onEditBuyer}>
            <UserPen className="mr-1.5 h-4 w-4" />Edit buyer details
          </Button>
        </div>
      </div>
    </header>
  );
}

const label = (id: OutputAction) => OUTPUT_ACTIONS.find((a) => a.id === id)?.label ?? id;

/** Word / PDF with an explicit client or staff copy (the buyer is at this screen). */
function OutputMenu({ kind, icon, busy, off, onAction }: {
  kind: 'word' | 'pdf'; icon: React.ReactNode; busy: OutputAction | null; off: boolean; onAction: (a: OutputAction) => void;
}) {
  const items = OUTPUT_ACTIONS.filter((a) => a.id.startsWith(`${kind}_`));
  const running = busy !== null && busy.startsWith(`${kind}_`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={off}>
          {icon}{running ? 'Exporting…' : kind === 'word' ? 'Word' : 'PDF'}<ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => onAction(a.id)} className={a.staff ? 'text-amber-800 dark:text-amber-300' : undefined}>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
