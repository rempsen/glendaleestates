import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageWidgetWrapperProps {
  id: string;
  title: string;
  children: ReactNode;
  isEditing: boolean;
  onRemove?: () => void;
  className?: string;
  noPadding?: boolean;
  transparent?: boolean;
}

export function PageWidgetWrapper({
  id,
  title,
  children,
  isEditing,
  onRemove,
  className,
  noPadding = false,
  transparent = false,
}: PageWidgetWrapperProps) {
  if (transparent) {
    return (
      <div className={cn("relative h-full", className)}>
        {isEditing && (
          <div className="absolute -top-2 -left-2 -right-2 -bottom-2 border-2 border-dashed border-primary/30 rounded-xl pointer-events-none z-10" />
        )}
        {isEditing && (
          <div className="absolute -top-3 left-2 z-20 flex items-center gap-1 bg-background rounded-md shadow-sm border border-border px-2 py-1">
            <div className="drag-handle cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded">
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive hover:text-destructive ml-1"
                onClick={onRemove}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        )}
        <div className="h-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <Card className={cn(
      "h-full overflow-hidden transition-all",
      isEditing && "ring-2 ring-primary/20 ring-offset-2",
      className
    )}>
      <CardHeader className={cn(
        "pb-2",
        isEditing && "cursor-default"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isEditing && (
              <div className="drag-handle cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
          </div>
          {isEditing && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn(noPadding && "p-0")}>
        {children}
      </CardContent>
    </Card>
  );
}
