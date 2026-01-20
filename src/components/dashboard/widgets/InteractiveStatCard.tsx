import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InteractiveStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  onClick?: () => void;
  highlighted?: boolean;
}

export function InteractiveStatCard({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend,
  onClick,
  highlighted = false
}: InteractiveStatCardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="w-4 h-4" />;
    if (trend.value < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (!trend) return '';
    if (trend.value > 0) return 'text-success';
    if (trend.value < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  return (
    <div 
      className={cn(
        "h-full flex flex-col justify-center transition-all duration-200",
        onClick && "cursor-pointer hover:scale-[1.02]",
        highlighted && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl sm:text-3xl font-serif font-semibold text-foreground">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn("mt-2 flex items-center gap-1", getTrendColor())}>
              {getTrendIcon()}
              <span className="text-sm font-medium">
                {trend.value > 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2 sm:p-3 rounded-lg bg-primary/10 shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
