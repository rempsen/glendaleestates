import { useState, useEffect, useCallback } from 'react';
import { WidgetConfig, DashboardLayout, DEFAULT_LAYOUT } from '@/components/dashboard/types';

const STORAGE_KEY = 'admin-dashboard-layout';
const LAYOUTS_KEY = 'admin-dashboard-saved-layouts';

export function useDashboardLayout() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_LAYOUT);
  const [savedLayouts, setSavedLayouts] = useState<DashboardLayout[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load layout from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setWidgets(parsed);
      } catch (e) {
        console.error('Failed to parse stored layout:', e);
      }
    }

    const storedLayouts = localStorage.getItem(LAYOUTS_KEY);
    if (storedLayouts) {
      try {
        setSavedLayouts(JSON.parse(storedLayouts));
      } catch (e) {
        console.error('Failed to parse saved layouts:', e);
      }
    }
  }, []);

  // Save current layout to localStorage
  const saveLayout = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    setHasChanges(false);
  }, [widgets]);

  // Update widget positions after drag/resize
  const updateWidgetPositions = useCallback((newLayout: { i: string; x: number; y: number; w: number; h: number }[]) => {
    setWidgets(prev => prev.map(widget => {
      const layoutItem = newLayout.find(l => l.i === widget.id);
      if (layoutItem) {
        return {
          ...widget,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        };
      }
      return widget;
    }));
    setHasChanges(true);
  }, []);

  // Add a new widget
  const addWidget = useCallback((widget: WidgetConfig) => {
    setWidgets(prev => [...prev, widget]);
    setHasChanges(true);
  }, []);

  // Remove a widget
  const removeWidget = useCallback((widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
    setHasChanges(true);
  }, []);

  // Reset to default layout
  const resetLayout = useCallback(() => {
    setWidgets(DEFAULT_LAYOUT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LAYOUT));
    setHasChanges(false);
  }, []);

  // Save layout with a name
  const saveLayoutAs = useCallback((name: string) => {
    const newLayout: DashboardLayout = {
      id: `layout-${Date.now()}`,
      name,
      widgets: [...widgets],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...savedLayouts, newLayout];
    setSavedLayouts(updated);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(updated));
    return newLayout;
  }, [widgets, savedLayouts]);

  // Load a saved layout
  const loadLayout = useCallback((layoutId: string) => {
    const layout = savedLayouts.find(l => l.id === layoutId);
    if (layout) {
      setWidgets(layout.widgets);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.widgets));
      setHasChanges(false);
    }
  }, [savedLayouts]);

  // Delete a saved layout
  const deleteLayout = useCallback((layoutId: string) => {
    const updated = savedLayouts.filter(l => l.id !== layoutId);
    setSavedLayouts(updated);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(updated));
  }, [savedLayouts]);

  return {
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
  };
}
