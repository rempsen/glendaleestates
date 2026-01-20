import { useState } from 'react';
import { Plus, Save, RotateCcw, Edit3, Check, FolderOpen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { WIDGET_CATALOG, WidgetConfig, DashboardLayout } from './types';

interface DashboardToolbarProps {
  isEditing: boolean;
  hasChanges: boolean;
  savedLayouts: DashboardLayout[];
  onToggleEdit: () => void;
  onSave: () => void;
  onReset: () => void;
  onAddWidget: (widget: WidgetConfig) => void;
  onSaveAs: (name: string) => void;
  onLoadLayout: (layoutId: string) => void;
  onDeleteLayout: (layoutId: string) => void;
}

export function DashboardToolbar({
  isEditing,
  hasChanges,
  savedLayouts,
  onToggleEdit,
  onSave,
  onReset,
  onAddWidget,
  onSaveAs,
  onLoadLayout,
  onDeleteLayout,
}: DashboardToolbarProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [layoutName, setLayoutName] = useState('');

  const handleAddWidget = (type: typeof WIDGET_CATALOG[number]) => {
    const newWidget: WidgetConfig = {
      id: `${type.type}-${Date.now()}`,
      type: type.type,
      title: type.title,
      x: 0,
      y: Infinity, // Will be placed at the bottom
      w: type.defaultSize.w,
      h: type.defaultSize.h,
      minW: type.minSize.w,
      minH: type.minSize.h,
    };
    onAddWidget(newWidget);
  };

  const handleSaveAs = () => {
    if (layoutName.trim()) {
      onSaveAs(layoutName.trim());
      setLayoutName('');
      setSaveDialogOpen(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Edit Mode Toggle */}
        <Button
          variant={isEditing ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleEdit}
          className="gap-2"
        >
          {isEditing ? <Check className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          {isEditing ? 'Done Editing' : 'Customize'}
        </Button>

        {isEditing && (
          <>
            {/* Add Widget */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Add Widget
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Available Widgets</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {WIDGET_CATALOG.map((widget) => (
                  <DropdownMenuItem
                    key={widget.type}
                    onClick={() => handleAddWidget(widget)}
                  >
                    {widget.title}
                    <Badge variant="outline" className="ml-auto text-xs">
                      {widget.defaultSize.w}x{widget.defaultSize.h}
                    </Badge>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Save */}
            <Button
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={!hasChanges}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>

            {/* Reset */}
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </>
        )}

        {/* Saved Layouts */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Layouts
              {savedLayouts.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {savedLayouts.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Saved Layouts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {savedLayouts.length === 0 ? (
              <DropdownMenuItem disabled>No saved layouts</DropdownMenuItem>
            ) : (
              savedLayouts.map((layout) => (
                <DropdownMenuItem
                  key={layout.id}
                  className="flex items-center justify-between"
                >
                  <span 
                    className="flex-1 cursor-pointer"
                    onClick={() => onLoadLayout(layout.id)}
                  >
                    {layout.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLayout(layout.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>
              <Save className="w-4 h-4 mr-2" />
              Save Current as New
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Save As Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Layout</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Layout name..."
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveAs()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAs} disabled={!layoutName.trim()}>
              Save Layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
