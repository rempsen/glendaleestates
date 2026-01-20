import { useState, useRef, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { DashboardToolbar } from '@/components/dashboard/DashboardToolbar';
import { WidgetGrid } from '@/components/dashboard/WidgetGrid';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { useDashboardData } from '@/hooks/useDashboardData';
import { DateRange } from '@/components/dashboard/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AdminDashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  const {
    widgets,
    savedLayouts,
    isEditing,
    hasChanges,
    setIsEditing,
    saveLayout,
    updateWidgetPositions,
    addWidget,
    removeWidget,
    resetLayout,
    saveLayoutAs,
    loadLayout,
    deleteLayout,
  } = useDashboardLayout();

  const { stats, loading, submissions, pipeline, totalUnits } = useDashboardData(dateRange);

  // Track container width for responsive grid
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Combine stats with totalUnits for widget rendering
  const widgetStats = {
    ...stats,
    totalUnits,
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-48" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
                Glendale Estates Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                {isEditing ? 'Drag widgets to rearrange • Resize from corners' : `Managing ${submissions.length} submissions`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DateRangeFilter 
                dateRange={dateRange} 
                onDateRangeChange={setDateRange} 
              />
              <Button variant="outline" size="icon" title="Export Report">
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Toolbar */}
          <DashboardToolbar
            isEditing={isEditing}
            hasChanges={hasChanges}
            savedLayouts={savedLayouts}
            onToggleEdit={() => setIsEditing(!isEditing)}
            onSave={saveLayout}
            onReset={resetLayout}
            onAddWidget={addWidget}
            onSaveAs={saveLayoutAs}
            onLoadLayout={loadLayout}
            onDeleteLayout={deleteLayout}
          />
        </div>

        {/* Widget Grid */}
        <div ref={containerRef} className="min-h-[600px]">
          <WidgetGrid
            widgets={widgets}
            isEditing={isEditing}
            onLayoutChange={updateWidgetPositions}
            onRemoveWidget={removeWidget}
            stats={widgetStats}
            width={containerWidth}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
