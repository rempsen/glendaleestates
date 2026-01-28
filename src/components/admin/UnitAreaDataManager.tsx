import { useState } from 'react';
import { useUnitAreaData, UnitAreaData } from '@/hooks/useUnitAreaData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Plus, Trash2, Loader2, RefreshCw, Ruler, Save } from 'lucide-react';

const AREA_FIELDS = [
  { key: 'all_lvp', label: 'All Standard LVP Areas', unit: 'sq ft', description: 'Total standard LVP area (excludes LVT in bathrooms/laundry)' },
  { key: 'main_living', label: 'Main Living (Hardwood)', unit: 'sq ft', description: 'Living area for hardwood upgrade' },
  { key: 'second_bedroom', label: '2nd Bedroom (LVP)', unit: 'sq ft', description: 'Second bedroom LVP area' },
  { key: 'master_bedroom_lvp', label: 'Master Bedroom (LVP)', unit: 'sq ft', description: 'Master bedroom LVP area' },
  { key: 'master_bedroom', label: 'Master Bedroom (Carpet)', unit: 'sq yd', description: 'Master bedroom carpet area (G/H 2nd floor: All bedrooms and hallway)' },
  { key: 'second_bedroom_carpet', label: '2nd Bedroom (Carpet)', unit: 'sq yd', description: 'Second bedroom carpet upgrade' },
  { key: 'guest_bathroom', label: 'Guest Bathroom (LVT)', unit: 'sq ft', description: 'Guest bathroom LVT area' },
  { key: 'master_ensuite', label: 'Master Ensuite (LVT)', unit: 'sq ft', description: 'Master ensuite LVT area' },
  { key: 'laundry', label: 'Laundry (LVT)', unit: 'sq ft', description: 'Laundry room LVT area' },
  { key: 'backsplash', label: 'Backsplash', unit: 'sq ft', description: 'Kitchen backsplash area' },
] as const;

export function UnitAreaDataManager() {
  const { unitAreaData, loading, saving, refetch, updateUnitArea, addUnitArea, deleteUnitArea } = useUnitAreaData();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingValues, setEditingValues] = useState<Record<string, Record<string, number>>>({});
  const [newUnit, setNewUnit] = useState({
    unit_type_code: '',
    unit_type_label: '',
    all_lvp: 0,
    main_living: 0,
    second_bedroom: 0,
    master_bedroom_lvp: 0,
    master_bedroom: 0,
    second_bedroom_carpet: 0,
    guest_bathroom: 0,
    master_ensuite: 0,
    laundry: 0,
    backsplash: 0,
    display_order: 0,
  });

  const handleFieldChange = (unitId: string, field: string, value: number) => {
    setEditingValues(prev => ({
      ...prev,
      [unitId]: {
        ...(prev[unitId] || {}),
        [field]: value,
      }
    }));
  };

  const handleSaveUnit = async (unit: UnitAreaData) => {
    const changes = editingValues[unit.id];
    if (changes && Object.keys(changes).length > 0) {
      await updateUnitArea(unit.id, changes);
      setEditingValues(prev => {
        const next = { ...prev };
        delete next[unit.id];
        return next;
      });
    }
  };

  const handleAddUnit = async () => {
    if (!newUnit.unit_type_code || !newUnit.unit_type_label) {
      return;
    }
    const result = await addUnitArea(newUnit);
    if (result) {
      setIsAddOpen(false);
      setNewUnit({
        unit_type_code: '',
        unit_type_label: '',
        all_lvp: 0,
        main_living: 0,
        second_bedroom: 0,
        master_bedroom_lvp: 0,
        master_bedroom: 0,
        second_bedroom_carpet: 0,
        guest_bathroom: 0,
        master_ensuite: 0,
        laundry: 0,
        backsplash: 0,
        display_order: unitAreaData.length + 1,
      });
    }
  };

  const getDisplayValue = (unit: UnitAreaData, field: string) => {
    const editedValue = editingValues[unit.id]?.[field];
    return editedValue !== undefined ? editedValue : Number(unit[field as keyof UnitAreaData]);
  };

  const hasUnsavedChanges = (unitId: string) => {
    return editingValues[unitId] && Object.keys(editingValues[unitId]).length > 0;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Unit Square Footage Data
            </CardTitle>
            <CardDescription>
              Manage area measurements for each unit type used in pricing calculations
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetch} disabled={saving}>
              <RefreshCw className={`h-4 w-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Unit Type
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Unit Type</DialogTitle>
                  <DialogDescription>
                    Create a new unit type with area measurements for pricing calculations
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="unit_type_code">Unit Type Code *</Label>
                      <Input
                        id="unit_type_code"
                        value={newUnit.unit_type_code}
                        onChange={(e) => setNewUnit(prev => ({ ...prev, unit_type_code: e.target.value }))}
                        placeholder="e.g., K or G-3"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="unit_type_label">Display Label *</Label>
                      <Input
                        id="unit_type_label"
                        value={newUnit.unit_type_label}
                        onChange={(e) => setNewUnit(prev => ({ ...prev, unit_type_label: e.target.value }))}
                        placeholder="e.g., Unit Type K"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {AREA_FIELDS.map(field => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`new-${field.key}`} className="text-sm">
                          {field.label}
                          <span className="text-muted-foreground ml-1">({field.unit})</span>
                        </Label>
                        <Input
                          id={`new-${field.key}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={newUnit[field.key as keyof typeof newUnit] || 0}
                          onChange={(e) => setNewUnit(prev => ({ ...prev, [field.key]: parseFloat(e.target.value) || 0 }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddUnit} disabled={saving || !newUnit.unit_type_code || !newUnit.unit_type_label}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Unit Type
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {unitAreaData.map((unit) => (
            <AccordionItem key={unit.id} value={unit.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{unit.unit_type_code}</span>
                    <span className="text-muted-foreground">{unit.unit_type_label}</span>
                    {hasUnsavedChanges(unit.id) && (
                      <span className="text-xs bg-warning text-warning-foreground px-2 py-0.5 rounded">Unsaved</span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Total LVP: {Number(unit.all_lvp).toLocaleString()} sq ft
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pt-4 pb-2">
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-4 mb-4">
                    {AREA_FIELDS.map(field => (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={`${unit.id}-${field.key}`} className="text-xs">
                          {field.label}
                          <span className="text-muted-foreground ml-1">({field.unit})</span>
                        </Label>
                        <Input
                          id={`${unit.id}-${field.key}`}
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-8 text-sm"
                          value={getDisplayValue(unit, field.key)}
                          onChange={(e) => handleFieldChange(unit.id, field.key, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Unit Type?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete {unit.unit_type_code} ({unit.unit_type_label}). 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteUnitArea(unit.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button 
                      size="sm" 
                      onClick={() => handleSaveUnit(unit)}
                      disabled={saving || !hasUnsavedChanges(unit.id)}
                    >
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        
        {unitAreaData.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No unit types configured. Click "Add Unit Type" to create one.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
