// Console "Buyer" column (Phase 2 Task 13): the latest buyer response for a line, comment in a tooltip.
import { CheckCircle2, HelpCircle, Minus } from 'lucide-react';
import { buyerResponseLabel, type LineReview } from '@/lib/myQuoteModel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function BuyerResponseCell({ review }: { review?: LineReview }) {
  const label = buyerResponseLabel(review);
  const icon = !review
    ? <Minus className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
    : review.response === 'accepted'
      ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
      : <HelpCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" tabIndex={0} aria-label={label} className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted">
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {label}
        {review && <span className="block text-muted-foreground">{new Date(review.created_at).toLocaleString('en-CA')}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
