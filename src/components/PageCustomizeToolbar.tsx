import { useState } from 'react';
import { Plus, Save, RotateCcw, Edit3, Check, FolderOpen, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PageWidgetConfig, PageLayoutConfig, WidgetDefinition } from '@/hooks/usePageLayout';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PageCustomizeToolbarProps {
  isEditing: boolean;
  hasChanges: boolean;
  widgets: PageWidgetConfig[];
  savedLayouts: PageLayoutConfig[];
  widgetCatalog: WidgetDefinition[];
  onToggleEdit: () => void;
  onSave: () => void;
  onReset: () => void;
  onToggleWidget: (widgetId: string) => void;
  onAddWidget: (widgetType: string) => void;
  onSaveAs: (name: string) => void;
  onLoadLayout: (layoutId: string) => void;
  onDeleteLayout: (layoutId: string) => void;
}

export function PageCustomizeToolbar({
  isEditing,
  hasChanges,
  widgets,
  savedLayouts,
  widgetCatalog,
  onToggleEdit,
  onSave,
  onReset,
  onToggleWidget,
  onAddWidget,
  onSaveAs,
  onLoadLayout,
  onDeleteLayout,
}: PageCustomizeToolbarProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [layoutName, setLayoutName] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSaveAs = () => {
    if (layoutName.trim()) {
      onSaveAs(layoutName.trim());
      setLayoutName('');
      setSaveDialogOpen(false);
    }
  };

  const getWidgetDefinition = (type: string) => {
    return widgetCatalog.find(w => w.type === type);
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
          {isEditing ? 'Done' : 'Customize'}
        </Button>

        {isEditing && (
          <>
            {/* Widget Visibility Sheet */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="w-4 h-4" />
                  Modules
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Page Modules</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                  <div className="space-y-4 pr-4">
                    {/* Current Widgets */}
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">Current Modules</h4>
                      <div className="space-y-2">
                        {widgets.map((widget) => (
                          <div
                            key={widget.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                          >
                            <div className="flex-1">
                              <span className="font-medium text-sm">{widget.title}</span>
                              <p className="text-xs text-muted-foreground">
                                {getWidgetDefinition(widget.type)?.description || widget.type}
                              </p>
                            </div>
                            <Switch
                              checked={widget.visible}
                              onCheckedChange={() => onToggleWidget(widget.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Add New Widget */}
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-3">Add Module</h4>
                      <div className="space-y-2">
                        {widgetCatalog.map((definition) => {
                          const existingCount = widgets.filter(w => w.type === definition.type).length;
                          return (
                            <button
                              key={definition.type}
                              onClick={() => {
                                onAddWidget(definition.type);
                              }}
                              className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left"
                            >
                              <div className="flex-1">
                                <span className="font-medium text-sm">{definition.title}</span>
                                {definition.description && (
                                  <p className="text-xs text-muted-foreground">{definition.description}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {existingCount > 0 && (
                                  <Badge variant="secondary" className="text-xs">
                                    {existingCount}
                                  </Badge>
                                )}
                                <Plus className="w-4 h-4 text-muted-foreground" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>

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
        {savedLayouts.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <FolderOpen className="w-4 h-4" />
                Layouts
                <Badge variant="secondary" className="ml-1">
                  {savedLayouts.length}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Saved Layouts</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedLayouts.map((layout) => (
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
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>
                <Save className="w-4 h-4 mr-2" />
                Save Current as New
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isEditing && savedLayouts.length === 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSaveDialogOpen(true)}
            className="gap-2 text-muted-foreground"
          >
            <Save className="w-4 h-4" />
            Save Layout
          </Button>
        )}
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
