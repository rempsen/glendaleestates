import { ReactNode } from 'react';
import { X, GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardWidgetProps {
  id: string;
  title: string;
  children: ReactNode;
  isEditing: boolean;
  onRemove?: () => void;
  className?: string;
  noPadding?: boolean;
}

export function DashboardWidget({ 
  id, 
  title, 
  children, 
  isEditing, 
  onRemove,
  className,
  noPadding = false
}: DashboardWidgetProps) {
  return (
    <div className={cn(
      "h-full rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col",
      isEditing && "ring-2 ring-primary/20 cursor-move",
      className
    )}>
      {/* Widget Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30",
        isEditing && "cursor-move"
      )}>
        <div className="flex items-center gap-2">
          {isEditing && (
            <GripVertical className="w-4 h-4 text-muted-foreground drag-handle cursor-grab" />
          )}
          <h3 className="font-medium text-sm text-foreground">{title}</h3>
        </div>
        {isEditing && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
      
      {/* Widget Content */}
      <div className={cn(
        "flex-1 overflow-auto",
        !noPadding && "p-4"
      )}>
        {children}
      </div>
    </div>
  );
}
