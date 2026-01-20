import { StatCard } from '@/components/StatCard';
import { Building, FileCheck, DollarSign, TrendingUp } from 'lucide-react';

interface PipelineStats {
  totalTracked: number;
  untrackedUnits: number;
  contractsSigned: number;
  depositsReceived: number;
  totalRevenue: number;
  totalTax: number;
  avgContractValue: number;
}

interface PipelineStatsWidgetProps {
  stats: PipelineStats;
}

export function PipelineStatsWidget({ stats }: PipelineStatsWidgetProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 h-full">
      <StatCard 
        title="Units Engaged" 
        value={stats.totalTracked} 
        subtitle={`${stats.untrackedUnits} not yet contacted`} 
        icon={<Building className="w-5 h-5 text-primary" />} 
      />
      <StatCard 
        title="Contracts Signed" 
        value={stats.contractsSigned} 
        subtitle={`${stats.depositsReceived} deposits received`} 
        icon={<FileCheck className="w-5 h-5 text-success" />} 
      />
      <StatCard 
        title="Total Revenue" 
        value={`$${stats.totalRevenue.toLocaleString()}`} 
        subtitle={`$${stats.totalTax.toLocaleString()} in GST`} 
        icon={<DollarSign className="w-5 h-5 text-primary" />} 
      />
      <StatCard 
        title="Avg Contract" 
        value={`$${Math.round(stats.avgContractValue).toLocaleString()}`} 
        subtitle="Per signed unit" 
        icon={<TrendingUp className="w-5 h-5 text-accent" />} 
      />
    </div>
  );
}
