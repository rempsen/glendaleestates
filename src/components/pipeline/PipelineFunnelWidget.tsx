import { Badge } from '@/components/ui/badge';

interface StageData {
  value: string;
  label: string;
  color: string;
}

interface PipelineFunnelWidgetProps {
  stages: StageData[];
  byStage: Record<string, number>;
  totalUnits: number;
}

export function PipelineFunnelWidget({ stages, byStage, totalUnits }: PipelineFunnelWidgetProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-4 h-full">
      {stages.map((stage) => (
        <div key={stage.value} className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline" className={stage.color}>{stage.label}</Badge>
            <span className="text-2xl font-serif font-semibold">
              {byStage[stage.value] || 0}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all" 
              style={{ width: `${((byStage[stage.value] || 0) / totalUnits) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
