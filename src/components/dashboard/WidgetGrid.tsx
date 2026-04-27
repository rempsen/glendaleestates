import { useMemo } from 'react';
import GridLayout, { verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { DashboardWidget } from './DashboardWidget';
import { WidgetConfig } from './types';
import { 
  PipelineFunnelWidget, 
  StatusPieWidget, 
  RevenueChartWidget,
  UpgradePopularityWidget,
  ColorPreferencesWidget 
} from './widgets/ChartWidgets';
import { InteractiveStatCard } from './widgets/InteractiveStatCard';
import { RecentSubmissionsWidget } from './widgets/RecentSubmissionsWidget';
import { QuickStatsWidget } from './widgets/QuickStatsWidget';
import { UnknownAreaCommentsWidget } from './widgets/UnknownAreaCommentsWidget';
import { DollarSign, TrendingUp, Home, FileCheck } from 'lucide-react';

interface WidgetGridProps {
  widgets: WidgetConfig[];
  isEditing: boolean;
  onLayoutChange: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  onRemoveWidget: (widgetId: string) => void;
  stats: any;
  width: number;
}

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--info))',
  'hsl(var(--accent))',
];

export function WidgetGrid({ 
  widgets, 
  isEditing, 
  onLayoutChange, 
  onRemoveWidget,
  stats,
  width
}: WidgetGridProps) {
  const layout = useMemo(() => 
    widgets.map(w => ({
      i: w.id,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      minW: w.minW,
      minH: w.minH,
      maxW: w.maxW,
      maxH: w.maxH,
    })), [widgets]);

  const renderWidgetContent = (widget: WidgetConfig) => {
    switch (widget.type) {
      case 'stat-card':
        if (widget.title === 'Total Revenue' || widget.id.includes('stat-1')) {
          return (
            <InteractiveStatCard
              title="Total Revenue"
              value={`$${stats.pipelineStats.totalRevenue.toLocaleString()}`}
              subtitle={`${stats.pipelineStats.contractsSigned} contracts signed`}
              icon={<DollarSign className="w-5 h-5 text-success" />}
            />
          );
        }
        if (widget.title === 'Conversion Rate' || widget.id.includes('stat-2')) {
          return (
            <InteractiveStatCard
              title="Conversion Rate"
              value={`${stats.conversionRate.toFixed(1)}%`}
              subtitle={`${stats.pipelineStats.signed} of ${stats.pipelineStats.lead + stats.pipelineStats.meeting + stats.pipelineStats.quoted + stats.pipelineStats.signed} leads`}
              icon={<TrendingUp className="w-5 h-5 text-primary" />}
            />
          );
        }
        if (widget.title === 'Units Signed' || widget.id.includes('stat-3')) {
          return (
            <InteractiveStatCard
              title="Units Signed"
              value={stats.pipelineStats.signed}
              subtitle={`${stats.pipelineStats.depositsReceived} deposits received`}
              icon={<FileCheck className="w-5 h-5 text-success" />}
            />
          );
        }
        if (widget.title === 'Avg Contract' || widget.id.includes('stat-4')) {
          return (
            <InteractiveStatCard
              title="Avg Contract Value"
              value={`$${Math.round(stats.avgContractValue).toLocaleString()}`}
              subtitle="Per signed deal"
              icon={<Home className="w-5 h-5 text-primary" />}
            />
          );
        }
        return <div className="text-muted-foreground">Configure stat card</div>;

      case 'pipeline-funnel':
        const funnelData = [
          { name: 'Total Units', value: stats.totalUnits, fill: 'hsl(var(--muted-foreground))' },
          { name: 'Contacted', value: stats.pipelineStats.lead + stats.pipelineStats.meeting + stats.pipelineStats.quoted + stats.pipelineStats.signed, fill: 'hsl(var(--info))' },
          { name: 'Meeting+', value: stats.pipelineStats.meeting + stats.pipelineStats.quoted + stats.pipelineStats.signed, fill: 'hsl(var(--warning))' },
          { name: 'Quoted+', value: stats.pipelineStats.quoted + stats.pipelineStats.signed, fill: 'hsl(var(--primary))' },
          { name: 'Signed', value: stats.pipelineStats.signed, fill: 'hsl(var(--success))' },
        ];
        return <PipelineFunnelWidget data={funnelData} totalUnits={stats.totalUnits} />;

      case 'revenue-chart':
        const revenueData = [
          { name: 'Contract Revenue', value: stats.pipelineStats.totalContractValue },
          { name: 'GST Collected', value: stats.pipelineStats.totalTax },
          { name: 'Window Revenue', value: stats.selectionStats.windowRevenue },
        ];
        return <RevenueChartWidget data={revenueData} />;

      case 'status-pie':
        const statusData = [
          { name: 'Submitted', value: stats.statusCounts.submitted || 0, color: 'hsl(var(--info))' },
          { name: 'Reviewed', value: stats.statusCounts.reviewed || 0, color: 'hsl(var(--primary))' },
          { name: 'Finalized', value: stats.statusCounts.finalized || 0, color: 'hsl(var(--success))' },
        ];
        return <StatusPieWidget data={statusData} />;

      case 'upgrade-popularity':
        const upgradeData = [
          { name: 'Window Coverings', value: stats.selectionStats.windowExtensions, fill: CHART_COLORS[0] },
          { name: 'Hardwood Flooring', value: stats.selectionStats.hardwoodUpgrades, fill: CHART_COLORS[1] },
          { name: 'Tile Upgrade', value: stats.selectionStats.tileUpgrades, fill: CHART_COLORS[2] },
          { name: 'Heated Floors', value: stats.selectionStats.heatedFloors, fill: CHART_COLORS[3] },
        ].sort((a, b) => b.value - a.value);
        return <UpgradePopularityWidget data={upgradeData} total={stats.selectionStats.total} />;

      case 'recent-submissions':
        return <RecentSubmissionsWidget submissions={stats.recentSubmissions} />;

      case 'quick-stats':
        const quickStats = [
          { label: 'Total Units', value: stats.totalUnits },
          { label: 'Contacted', value: stats.pipelineStats.lead + stats.pipelineStats.meeting + stats.pipelineStats.quoted + stats.pipelineStats.signed },
          { label: 'Signed', value: stats.pipelineStats.signed },
          { label: 'Deposits', value: stats.pipelineStats.depositsReceived },
          { label: 'Selections', value: stats.selectionStats.total },
          { label: 'Window Rev', value: `$${(stats.selectionStats.windowRevenue / 1000).toFixed(1)}k` },
        ];
        return <QuickStatsWidget stats={quickStats} />;

      case 'color-preferences':
        return (
          <ColorPreferencesWidget 
            lvpData={stats.lvpColorData} 
            carpetData={stats.carpetColorData} 
          />
        );

      case 'conversion-metrics':
        const conversionData = [
          { name: 'Lead → Meeting', value: stats.pipelineStats.meeting + stats.pipelineStats.quoted + stats.pipelineStats.signed },
          { name: 'Meeting → Quoted', value: stats.pipelineStats.quoted + stats.pipelineStats.signed },
          { name: 'Quoted → Signed', value: stats.pipelineStats.signed },
        ];
        return <RevenueChartWidget data={conversionData} />;

      default:
        return <div className="text-muted-foreground">Unknown widget type</div>;
    }
  };

  // Calculate columns based on width
  const cols = width >= 1200 ? 12 : width >= 768 ? 8 : 4;

  return (
    <GridLayout
      className="layout"
      layout={layout}
      gridConfig={{
        cols,
        rowHeight: 80,
        margin: [16, 16],
      }}
      dragConfig={{
        enabled: isEditing,
        handle: ".drag-handle",
      }}
      resizeConfig={{
        enabled: isEditing,
      }}
      compactor={verticalCompactor}
      width={width}
      onLayoutChange={onLayoutChange}
    >
      {widgets.map((widget) => (
        <div key={widget.id}>
          <DashboardWidget
            id={widget.id}
            title={widget.title}
            isEditing={isEditing}
            onRemove={() => onRemoveWidget(widget.id)}
          >
            {renderWidgetContent(widget)}
          </DashboardWidget>
        </div>
      ))}
    </GridLayout>
  );
}
