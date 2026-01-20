import { useState, useEffect, useCallback } from 'react';

export interface PageWidgetConfig {
  id: string;
  type: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  visible: boolean;
}

export interface PageLayoutConfig {
  id: string;
  name: string;
  widgets: PageWidgetConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface WidgetDefinition {
  type: string;
  title: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize?: { w: number; h: number };
  description?: string;
}

export function usePageLayout(
  pageKey: string,
  defaultWidgets: PageWidgetConfig[],
  widgetCatalog: WidgetDefinition[]
) {
  const STORAGE_KEY = `admin-page-layout-${pageKey}`;
  const LAYOUTS_KEY = `admin-page-layouts-${pageKey}`;

  const [widgets, setWidgets] = useState<PageWidgetConfig[]>(defaultWidgets);
  const [savedLayouts, setSavedLayouts] = useState<PageLayoutConfig[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load layout from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new widgets
        const mergedWidgets = defaultWidgets.map(defaultWidget => {
          const storedWidget = parsed.find((w: PageWidgetConfig) => w.id === defaultWidget.id);
          return storedWidget ? { ...defaultWidget, ...storedWidget } : defaultWidget;
        });
        // Add any new widgets from defaults that weren't in stored
        const storedIds = parsed.map((w: PageWidgetConfig) => w.id);
        const newWidgets = defaultWidgets.filter(w => !storedIds.includes(w.id));
        setWidgets([...mergedWidgets, ...newWidgets]);
      } catch (e) {
        console.error('Failed to parse stored layout:', e);
        setWidgets(defaultWidgets);
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
  }, [pageKey]);

  // Save current layout to localStorage
  const saveLayout = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    setHasChanges(false);
  }, [widgets, STORAGE_KEY]);

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

  // Toggle widget visibility
  const toggleWidget = useCallback((widgetId: string) => {
    setWidgets(prev => prev.map(w => 
      w.id === widgetId ? { ...w, visible: !w.visible } : w
    ));
    setHasChanges(true);
  }, []);

  // Add a new widget
  const addWidget = useCallback((widgetType: string) => {
    const definition = widgetCatalog.find(w => w.type === widgetType);
    if (!definition) return;

    const newWidget: PageWidgetConfig = {
      id: `${widgetType}-${Date.now()}`,
      type: widgetType,
      title: definition.title,
      x: 0,
      y: Infinity,
      w: definition.defaultSize.w,
      h: definition.defaultSize.h,
      minW: definition.minSize.w,
      minH: definition.minSize.h,
      maxW: definition.maxSize?.w,
      maxH: definition.maxSize?.h,
      visible: true,
    };
    setWidgets(prev => [...prev, newWidget]);
    setHasChanges(true);
  }, [widgetCatalog]);

  // Remove a widget
  const removeWidget = useCallback((widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
    setHasChanges(true);
  }, []);

  // Reset to default layout
  const resetLayout = useCallback(() => {
    setWidgets(defaultWidgets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultWidgets));
    setHasChanges(false);
  }, [defaultWidgets, STORAGE_KEY]);

  // Save layout with a name
  const saveLayoutAs = useCallback((name: string) => {
    const newLayout: PageLayoutConfig = {
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
  }, [widgets, savedLayouts, LAYOUTS_KEY]);

  // Load a saved layout
  const loadLayout = useCallback((layoutId: string) => {
    const layout = savedLayouts.find(l => l.id === layoutId);
    if (layout) {
      setWidgets(layout.widgets);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout.widgets));
      setHasChanges(false);
    }
  }, [savedLayouts, STORAGE_KEY]);

  // Delete a saved layout
  const deleteLayout = useCallback((layoutId: string) => {
    const updated = savedLayouts.filter(l => l.id !== layoutId);
    setSavedLayouts(updated);
    localStorage.setItem(LAYOUTS_KEY, JSON.stringify(updated));
  }, [savedLayouts, LAYOUTS_KEY]);

  // Get visible widgets only
  const visibleWidgets = widgets.filter(w => w.visible);

  return {
    widgets,
    visibleWidgets,
    savedLayouts,
    isEditing,
    hasChanges,
    widgetCatalog,
    setIsEditing,
    saveLayout,
    updateWidgetPositions,
    toggleWidget,
    addWidget,
    removeWidget,
    resetLayout,
    saveLayoutAs,
    loadLayout,
    deleteLayout,
  };
}
