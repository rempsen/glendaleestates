import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sofa, BedDouble, Bed, Grid3x3, Bath, ShowerHead, 
  WashingMachine, LayoutGrid, Home, Check, Plus, X, 
  ChevronDown, ChevronUp, Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AreaUpgradeSelection,
  UpgradeArea,
  getAvailableAreasForUnit,
  UPGRADE_MATERIALS,
  AREA_DEFINITIONS,
  UNIT_AREA_DATA,
  calculateAreaUpgradePrice,
  requiresFloorSelection,
} from '@/lib/upgradeCostData';

interface RoomUpgradePickerProps {
  unitTypeCode: string | null;
  selectedFloor?: '1' | '2' | null; // For G and H units
  selections: AreaUpgradeSelection[];
  onSelectionsChange: (selections: AreaUpgradeSelection[]) => void;
  onFloorChange?: (floor: '1' | '2') => void;
}

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sofa,
  BedDouble,
  Bed,
  Grid3x3,
  Bath,
  ShowerHead,
  WashingMachine,
  LayoutGrid,
  Home,
};

export function RoomUpgradePicker({
  unitTypeCode,
  selectedFloor,
  selections,
  onSelectionsChange,
  onFloorChange,
}: RoomUpgradePickerProps) {
  const [expandedArea, setExpandedArea] = useState<UpgradeArea | null>(null);
  const [editingSelection, setEditingSelection] = useState<AreaUpgradeSelection | null>(null);

  // Determine the effective unit code (with floor suffix for G/H)
  const effectiveUnitCode = unitTypeCode 
    ? (requiresFloorSelection(unitTypeCode) && selectedFloor 
        ? `${unitTypeCode}-${selectedFloor}` 
        : unitTypeCode)
    : null;

  const availableAreas = effectiveUnitCode ? getAvailableAreasForUnit(effectiveUnitCode) : [];
  const unitData = effectiveUnitCode ? UNIT_AREA_DATA[effectiveUnitCode] : null;

  const isAreaSelected = (areaId: UpgradeArea) => {
    return selections.some(s => s.areaId === areaId);
  };

  const getSelectionForArea = (areaId: UpgradeArea) => {
    return selections.find(s => s.areaId === areaId);
  };

  const handleAddArea = (areaId: UpgradeArea) => {
    const areaInfo = AREA_DEFINITIONS.find(a => a.id === areaId);
    if (!areaInfo) return;

    const defaultMaterial = areaInfo.upgradeTypes[0];
    const newSelection: AreaUpgradeSelection = {
      areaId,
      materialType: defaultMaterial,
      productName: '',
      productColor: '',
      comments: '',
    };

    setEditingSelection(newSelection);
    setExpandedArea(areaId);
  };

  const handleRemoveArea = (areaId: UpgradeArea) => {
    onSelectionsChange(selections.filter(s => s.areaId !== areaId));
    if (expandedArea === areaId) {
      setExpandedArea(null);
    }
  };

  const handleSaveSelection = (selection: AreaUpgradeSelection) => {
    const existing = selections.findIndex(s => s.areaId === selection.areaId);
    if (existing >= 0) {
      const updated = [...selections];
      updated[existing] = selection;
      onSelectionsChange(updated);
    } else {
      onSelectionsChange([...selections, selection]);
    }
    setEditingSelection(null);
    setExpandedArea(null);
  };

  const handleEditSelection = (selection: AreaUpgradeSelection) => {
    setEditingSelection({ ...selection });
    setExpandedArea(selection.areaId);
  };

  if (!unitTypeCode) {
    return (
      <div className="p-6 rounded-xl border border-border bg-secondary/30 text-center">
        <p className="text-muted-foreground">
          Please enter your unit number in the Home Info step to see available upgrade areas.
        </p>
      </div>
    );
  }

  // Show floor selector for G and H units
  if (requiresFloorSelection(unitTypeCode) && !selectedFloor) {
    return (
      <div className="space-y-4">
        <div className="p-6 rounded-xl border border-border bg-card">
          <h4 className="font-medium text-foreground mb-3">Select Floor</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Unit type {unitTypeCode} has multiple floors. Please select which floor you'd like to upgrade.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-20 flex flex-col gap-1"
              onClick={() => onFloorChange?.('1')}
            >
              <Home className="w-6 h-6" />
              <span>1st Floor</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex flex-col gap-1"
              onClick={() => onFloorChange?.('2')}
            >
              <Home className="w-6 h-6" />
              <span>2nd Floor</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (availableAreas.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-border bg-secondary/30 text-center">
        <p className="text-muted-foreground">
          No upgrade areas available for unit type {effectiveUnitCode}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Floor indicator for G/H units */}
      {requiresFloorSelection(unitTypeCode) && selectedFloor && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
          <span className="text-sm font-medium text-primary">
            Showing upgrades for {unitTypeCode} - {selectedFloor === '1' ? '1st' : '2nd'} Floor
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onFloorChange?.(selectedFloor === '1' ? '2' : '1')}
          >
            Switch Floor
          </Button>
        </div>
      )}

      {/* Interactive Room Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {availableAreas.map((area) => {
          const Icon = iconMap[area.icon] || Home;
          const isSelected = isAreaSelected(area.id);
          const selection = getSelectionForArea(area.id);
          const isExpanded = expandedArea === area.id;
          const quantity = unitData?.[area.id] || 0;
          const pricing = effectiveUnitCode && isSelected && selection
            ? calculateAreaUpgradePrice(effectiveUnitCode, area.id, selection.materialType)
            : null;

          return (
            <motion.div
              key={area.id}
              layout
              className={`
                relative rounded-xl border-2 transition-all overflow-hidden
                ${isSelected 
                  ? 'border-primary bg-primary/5 shadow-lg' 
                  : 'border-border bg-card hover:border-primary/50 hover:bg-secondary/50'
                }
                ${isExpanded ? 'col-span-full md:col-span-2 lg:col-span-2' : ''}
              `}
            >
              {/* Room Card Header */}
              <div
                className="p-4 cursor-pointer"
                onClick={() => {
                  if (!isSelected) {
                    handleAddArea(area.id);
                  } else if (isExpanded) {
                    setExpandedArea(null);
                  } else {
                    setExpandedArea(area.id);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`
                      p-2 rounded-lg
                      ${isSelected ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}
                    `}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground text-sm">{area.name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {quantity} {area.unit === 'sqyd' ? 'sq yd' : 'sq ft'}
                      </p>
                    </div>
                  </div>
                  
                  {isSelected ? (
                    <div className="flex items-center gap-1">
                      <div className="p-1 rounded-full bg-primary text-primary-foreground">
                        <Check className="w-3 h-3" />
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  ) : (
                    <div className="p-1.5 rounded-lg bg-secondary text-muted-foreground">
                      <Plus className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* Quick info when selected but not expanded */}
                {isSelected && !isExpanded && pricing && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">
                        {UPGRADE_MATERIALS.find(m => m.id === selection?.materialType)?.name}
                      </span>
                      <span className="font-medium text-primary">
                        ${pricing.markedUpCost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded Selection Form */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-border"
                  >
                    <div className="p-4 space-y-4">
                      {/* Material Type Selection */}
                      <div>
                        <Label className="text-sm">Upgrade Material</Label>
                        <Select
                          value={editingSelection?.materialType || selection?.materialType || area.upgradeTypes[0]}
                          onValueChange={(value: 'lvp' | 'hardwood' | 'carpet' | 'tile') => {
                            setEditingSelection(prev => prev ? { ...prev, materialType: value } : {
                              areaId: area.id,
                              materialType: value,
                              productName: '',
                              productColor: '',
                              comments: '',
                            });
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {area.upgradeTypes.map(type => {
                              const material = UPGRADE_MATERIALS.find(m => m.id === type);
                              return (
                                <SelectItem key={type} value={type}>
                                  {material?.name} (${material?.costPerUnit}/{material?.unit === 'sqyd' ? 'sq yd' : 'sq ft'})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Product Details */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm">Product Name</Label>
                          <Input
                            placeholder="e.g., Mirage Hard Maple"
                            value={editingSelection?.productName || selection?.productName || ''}
                            onChange={(e) => {
                              setEditingSelection(prev => prev ? { ...prev, productName: e.target.value } : {
                                areaId: area.id,
                                materialType: area.upgradeTypes[0],
                                productName: e.target.value,
                                productColor: '',
                                comments: '',
                              });
                            }}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Color / Finish</Label>
                          <Input
                            placeholder="e.g., Natural Oak"
                            value={editingSelection?.productColor || selection?.productColor || ''}
                            onChange={(e) => {
                              setEditingSelection(prev => prev ? { ...prev, productColor: e.target.value } : {
                                areaId: area.id,
                                materialType: area.upgradeTypes[0],
                                productName: '',
                                productColor: e.target.value,
                                comments: '',
                              });
                            }}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      {/* Comments */}
                      <div>
                        <Label className="text-sm">Comments</Label>
                        <Input
                          placeholder="Any special notes..."
                          value={editingSelection?.comments || selection?.comments || ''}
                          onChange={(e) => {
                            setEditingSelection(prev => prev ? { ...prev, comments: e.target.value } : {
                              areaId: area.id,
                              materialType: area.upgradeTypes[0],
                              productName: '',
                              productColor: '',
                              comments: e.target.value,
                            });
                          }}
                          className="mt-1"
                        />
                      </div>

                      {/* Price Preview */}
                      {effectiveUnitCode && (
                        <div className="p-3 rounded-lg bg-secondary/50">
                          {(() => {
                            const materialType = editingSelection?.materialType || selection?.materialType || area.upgradeTypes[0];
                            const price = calculateAreaUpgradePrice(effectiveUnitCode, area.id, materialType);
                            return (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">
                                  {price.quantity} {price.unit} × ${UPGRADE_MATERIALS.find(m => m.id === materialType)?.costPerUnit} × 1.6
                                </span>
                                <span className="font-semibold text-primary">
                                  ${price.markedUpCost.toFixed(2)}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            if (editingSelection) {
                              handleSaveSelection(editingSelection);
                            } else if (selection) {
                              setExpandedArea(null);
                            }
                          }}
                        >
                          <Check className="w-4 h-4 mr-1" />
                          {isSelected ? 'Update' : 'Add Upgrade'}
                        </Button>
                        {isSelected && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveArea(area.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Selected upgrades summary */}
      {selections.length > 0 && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-foreground">Selected Upgrades</h4>
            <span className="text-sm text-muted-foreground">
              {selections.length} item{selections.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {selections.map(selection => {
              const area = AREA_DEFINITIONS.find(a => a.id === selection.areaId);
              const material = UPGRADE_MATERIALS.find(m => m.id === selection.materialType);
              const pricing = effectiveUnitCode 
                ? calculateAreaUpgradePrice(effectiveUnitCode, selection.areaId, selection.materialType)
                : null;

              return (
                <div key={selection.areaId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{area?.name}</span>
                    <span className="text-muted-foreground">• {material?.name}</span>
                    {selection.productName && (
                      <span className="text-xs text-muted-foreground">({selection.productName})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">${pricing?.markedUpCost.toFixed(2)}</span>
                    <button
                      onClick={() => handleEditSelection(selection)}
                      className="p-1 hover:bg-secondary rounded"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
