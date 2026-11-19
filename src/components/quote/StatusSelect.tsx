// Line status menu for the meeting console. `removed` is not offered (Remove action, with undo).
import type { LineStatus } from '@/lib/quoteLines';
import { STATUS_OPTIONS } from '@/lib/statusChange';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const TONE: Partial<Record<LineStatus, string>> = {
  included: 'text-muted-foreground',
  pending: 'text-amber-700 dark:text-amber-400',
  under_review: 'text-amber-700 dark:text-amber-400',
  deferred: 'text-muted-foreground',
};

export interface StatusSelectProps {
  value: LineStatus;
  onChange: (to: LineStatus) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function StatusSelect({ value, onChange, disabled, className, ariaLabel = 'Status' }: StatusSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as LineStatus)} disabled={disabled}>
      <SelectTrigger data-console-cell aria-label={ariaLabel} className={cn('h-9', TONE[value], className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
