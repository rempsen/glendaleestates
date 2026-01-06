import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type SelectionStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'finalized';

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    finalized: 'Finalized',
  };
  return labels[status] || status;
};

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-warning/20 text-warning-foreground',
    submitted: 'bg-info/20 text-info',
    reviewed: 'bg-primary/20 text-primary',
    finalized: 'bg-success/20 text-success',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
};

interface StatusBadgeProps {
  status: string;
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