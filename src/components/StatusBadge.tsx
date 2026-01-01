import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SelectionStatus, getStatusLabel, getStatusColor } from '@/lib/mockData';

interface StatusBadgeProps {
  status: SelectionStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge 
      variant="secondary"
      className={cn(getStatusColor(status), className)}
    >
      {getStatusLabel(status)}
    </Badge>
  );
}
