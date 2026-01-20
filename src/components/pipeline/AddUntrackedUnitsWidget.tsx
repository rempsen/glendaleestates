import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface AddUntrackedUnitsWidgetProps {
  untrackedUnits: string[];
  onAddUnit: (unitNumber: string) => void;
}

export function AddUntrackedUnitsWidget({ untrackedUnits, onAddUnit }: AddUntrackedUnitsWidgetProps) {
  if (untrackedUnits.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-border bg-muted/30 h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">All units are tracked in the pipeline.</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-dashed border-border bg-muted/30 h-full">
      <div className="flex items-center gap-2 mb-3">
        <Plus className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Quick Add Unit to Pipeline</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {untrackedUnits.slice(0, 20).map(unit => (
          <Button 
            key={unit} 
            variant="outline" 
            size="sm" 
            onClick={() => onAddUnit(unit)}
            className="h-8"
          >
            Unit {unit}
          </Button>
        ))}
        {untrackedUnits.length > 20 && (
          <span className="text-sm text-muted-foreground self-center">+{untrackedUnits.length - 20} more</span>
        )}
      </div>
    </div>
  );
}
