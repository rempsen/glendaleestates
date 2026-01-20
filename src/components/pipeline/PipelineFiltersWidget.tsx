import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';

interface StageData {
  value: string;
  label: string;
}

interface PipelineFiltersWidgetProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  stageFilter: string;
  onStageFilterChange: (value: string) => void;
  stages: StageData[];
}

export function PipelineFiltersWidget({
  searchTerm,
  onSearchChange,
  stageFilter,
  onStageFilterChange,
  stages,
}: PipelineFiltersWidgetProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 h-full items-start">
      <div className="relative flex-1 w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search by unit, name, or email..." 
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={stageFilter} onValueChange={onStageFilterChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by stage" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stages</SelectItem>
          {stages.map(s => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
