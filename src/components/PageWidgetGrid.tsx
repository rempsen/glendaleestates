import { useMemo, ReactNode } from 'react';
import { GridLayout, verticalCompactor } from 'react-grid-layout';
import { PageWidgetConfig } from '@/hooks/usePageLayout';
import { PageWidgetWrapper } from './PageWidgetWrapper';
import 'react-grid-layout/css/styles.css';

interface PageWidgetGridProps {
  widgets: PageWidgetConfig[];
  isEditing: boolean;
  onLayoutChange: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
  onRemoveWidget: (widgetId: string) => void;
  renderWidget: (widget: PageWidgetConfig) => ReactNode;
  width: number;
  rowHeight?: number;
  cols?: number;
}

export function PageWidgetGrid({
  widgets,
  isEditing,
  onLayoutChange,
  onRemoveWidget,
  renderWidget,
  width,
  rowHeight = 80,
  cols = 12,
}: PageWidgetGridProps) {
  const layout = useMemo(() => 
    widgets.filter(w => w.visible).map(widget => ({
      i: widget.id,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: widget.minW,
      minH: widget.minH,
      maxW: widget.maxW,
      maxH: widget.maxH,
    })),
    [widgets]
  );

  const visibleWidgets = widgets.filter(w => w.visible);

  if (visibleWidgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-border rounded-xl">
        <p className="text-muted-foreground">No modules visible. Click Customize to add modules.</p>
      </div>
    );
  }

  return (
    <GridLayout
      className="layout"
      layout={layout}
      gridConfig={{
        cols,
        rowHeight,
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
      {visibleWidgets.map((widget) => (
        <div key={widget.id}>
          <PageWidgetWrapper
            id={widget.id}
            title={widget.title}
            isEditing={isEditing}
            onRemove={() => onRemoveWidget(widget.id)}
            transparent={widget.type.startsWith('transparent-')}
          >
            {renderWidget(widget)}
          </PageWidgetWrapper>
        </div>
      ))}
    </GridLayout>
  );
}
