// Console banner for a quote that has no stored wizard / migration lines (final fix wave C1). See src/lib/itemiseQuote.ts.
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ITEMISE_BANNER_TEXT, ITEMISE_BANNER_TITLE } from '@/lib/itemiseQuote';

export interface ItemiseBannerProps { busy: boolean; disabled?: boolean; onItemise: () => void }

export function ItemiseBanner({ busy, disabled, onItemise }: ItemiseBannerProps) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{ITEMISE_BANNER_TITLE}</p>
        <p>{ITEMISE_BANNER_TEXT}</p>
      </div>
      <Button size="sm" disabled={busy || disabled} onClick={onItemise}>{busy ? 'Itemising…' : 'Itemise this quote'}</Button>
    </div>
  );
}
