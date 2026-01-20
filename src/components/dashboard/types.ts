export type WidgetType = 
  | 'stat-card'
  | 'pipeline-funnel'
  | 'revenue-chart'
  | 'status-pie'
  | 'upgrade-popularity'
  | 'recent-submissions'
  | 'quick-stats'
  | 'color-preferences'
  | 'conversion-metrics';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface DashboardLayout {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export interface DashboardFilters {
  dateRange: DateRange;
  pipelineStages: string[];
  upgradeTypes: string[];
}

export const WIDGET_CATALOG: { type: WidgetType; title: string; defaultSize: { w: number; h: number }; minSize: { w: number; h: number } }[] = [
  { type: 'stat-card', title: 'Stat Card', defaultSize: { w: 3, h: 2 }, minSize: { w: 2, h: 2 } },
  { type: 'pipeline-funnel', title: 'Pipeline Funnel', defaultSize: { w: 6, h: 4 }, minSize: { w: 4, h: 3 } },
  { type: 'revenue-chart', title: 'Revenue Breakdown', defaultSize: { w: 6, h: 4 }, minSize: { w: 4, h: 3 } },
  { type: 'status-pie', title: 'Status Overview', defaultSize: { w: 4, h: 4 }, minSize: { w: 3, h: 3 } },
  { type: 'upgrade-popularity', title: 'Upgrade Popularity', defaultSize: { w: 6, h: 3 }, minSize: { w: 4, h: 2 } },
  { type: 'recent-submissions', title: 'Recent Submissions', defaultSize: { w: 6, h: 4 }, minSize: { w: 4, h: 3 } },
  { type: 'quick-stats', title: 'Quick Stats Grid', defaultSize: { w: 12, h: 2 }, minSize: { w: 6, h: 2 } },
  { type: 'color-preferences', title: 'Color Preferences', defaultSize: { w: 6, h: 4 }, minSize: { w: 4, h: 3 } },
  { type: 'conversion-metrics', title: 'Conversion Metrics', defaultSize: { w: 6, h: 3 }, minSize: { w: 4, h: 2 } },
];

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: 'stat-1', type: 'stat-card', title: 'Total Revenue', x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'stat-2', type: 'stat-card', title: 'Conversion Rate', x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'stat-3', type: 'stat-card', title: 'Units Signed', x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'stat-4', type: 'stat-card', title: 'Avg Contract', x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { id: 'funnel-1', type: 'pipeline-funnel', title: 'Sales Funnel', x: 0, y: 2, w: 6, h: 4, minW: 4, minH: 3 },
  { id: 'revenue-1', type: 'revenue-chart', title: 'Revenue Breakdown', x: 6, y: 2, w: 6, h: 4, minW: 4, minH: 3 },
  { id: 'upgrade-1', type: 'upgrade-popularity', title: 'Upgrade Popularity', x: 0, y: 6, w: 6, h: 3, minW: 4, minH: 2 },
  { id: 'recent-1', type: 'recent-submissions', title: 'Recent Submissions', x: 6, y: 6, w: 6, h: 4, minW: 4, minH: 3 },
];
