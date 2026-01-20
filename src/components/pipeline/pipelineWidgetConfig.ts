import { PageWidgetConfig, WidgetDefinition } from '@/hooks/usePageLayout';

export const PIPELINE_WIDGET_CATALOG: WidgetDefinition[] = [
  {
    type: 'stats',
    title: 'Key Statistics',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    description: 'Revenue, contracts, and engagement stats',
  },
  {
    type: 'funnel',
    title: 'Pipeline Funnel',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 2 },
    description: 'Visual breakdown by pipeline stage',
  },
  {
    type: 'filters',
    title: 'Search & Filters',
    defaultSize: { w: 12, h: 1 },
    minSize: { w: 6, h: 1 },
    description: 'Search and filter pipeline records',
  },
  {
    type: 'quick-add',
    title: 'Quick Add Units',
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 6, h: 1 },
    description: 'Quickly add untracked units to pipeline',
  },
  {
    type: 'table',
    title: 'Pipeline Table',
    defaultSize: { w: 12, h: 5 },
    minSize: { w: 12, h: 3 },
    description: 'Full pipeline record table',
  },
];

export const PIPELINE_DEFAULT_LAYOUT: PageWidgetConfig[] = [
  { id: 'stats-1', type: 'stats', title: 'Key Statistics', x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 2, visible: true },
  { id: 'funnel-1', type: 'funnel', title: 'Pipeline Funnel', x: 0, y: 2, w: 12, h: 2, minW: 6, minH: 2, visible: true },
  { id: 'filters-1', type: 'filters', title: 'Search & Filters', x: 0, y: 4, w: 12, h: 1, minW: 6, minH: 1, visible: true },
  { id: 'quick-add-1', type: 'quick-add', title: 'Quick Add Units', x: 0, y: 5, w: 12, h: 2, minW: 6, minH: 1, visible: true },
  { id: 'table-1', type: 'table', title: 'Pipeline Table', x: 0, y: 7, w: 12, h: 5, minW: 12, minH: 3, visible: true },
];
