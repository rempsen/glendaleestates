// Meeting console header: unit · buyer · type · possession · status, and the output actions.
import { ArrowLeft, Eye, FileDown, FileText, PenLine, UserPen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type ConsoleAction = 'preview' | 'word' | 'pdf';

export interface ConsoleHeaderProps {
  unitNumber: string | null;
  buyerName: string;
  unitType: string | null;
  possession: string | null;
  status: string | null;
  /** The action currently running (its button shows a busy label); all actions disable meanwhile. */
  busy: ConsoleAction | null;
  /** Lines loading or not loaded: outputs are disabled. */
  outputsDisabled: boolean;
  onBack: () => void;
  onPreview: () => void;
  onWord: () => void;
  onPdf: () => void;
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
          <Button variant="outline" size="sm" disabled={off} onClick={p.onPreview}>
            <Eye className="mr-1.5 h-4 w-4" />{p.busy === 'preview' ? 'Preparing…' : 'Client preview'}
          </Button>
          <Button variant="outline" size="sm" disabled={off} onClick={p.onWord}>
            <FileText className="mr-1.5 h-4 w-4" />{p.busy === 'word' ? 'Exporting…' : 'Word'}
          </Button>
          <Button variant="outline" size="sm" disabled={off} onClick={p.onPdf}>
            <FileDown className="mr-1.5 h-4 w-4" />{p.busy === 'pdf' ? 'Exporting…' : 'PDF'}
          </Button>
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
