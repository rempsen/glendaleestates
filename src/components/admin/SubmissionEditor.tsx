import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  Save, X, Plus, Trash2, Home, Sofa, BedDouble, Bath, 
  WashingMachine, LayoutGrid, Flame, User
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AREA_DEFINITIONS,
  UPGRADE_MATERIALS,
  MaterialType,
  UpgradeArea,
  AreaUpgradeSelection,
} from '@/lib/upgradeCostData';

// LVP color options (standard selections from wizard)
const LVP_COLORS = [
  { id: 'cortland', name: 'Cortland' },
  { id: 'opal', name: 'Opal' },
  { id: 'wolf-river', name: 'Wolf River' },
];

// Tile color options
const TILE_COLORS = [
  { id: 'pezzo-grey', name: 'Pezzo Grey' },
  { id: 'piccolo-white', name: 'Piccolo White' },
  { id: 'venatino-polished', name: 'Venatino Polished' },
];

// Carpet color options
const CARPET_COLORS = [
  { id: 'jetstream', name: 'Jetstream' },
  { id: 'midnight', name: 'Midnight' },
  { id: 'sawgrass', name: 'Sawgrass' },
  { id: 'winterbrooke', name: 'Winterbrooke' },
];

// Backsplash orientation options
const BACKSPLASH_ORIENTATIONS = [
  { id: 'horizontal', name: 'Horizontal' },
  { id: 'stacked', name: 'Stacked (Vertical)' },
  { id: 'bricked', name: 'Bricked (Offset)' },
];

// Unit types
const UNIT_TYPES = [
  'Unit Type A', 'Unit Type B', 'Unit Type C', 'Unit Type D',
  'Unit Type E', 'Unit Type F', 'Unit Type G', 'Unit Type H', 'Unit Type J',
];

// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  heatedFloor?: boolean;
}

// Submission interface matching the database schema
interface BuyerSelection {
  id: string;
  created_at: string;
  updated_at: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string;
  estimated_possession_date: string | null;
  has_stairs: boolean;
  lvp_colour: string | null;
  lvp_comments: string | null;
  spc_tile_colour: string | null;
  spc_tile_comments: string | null;
  backsplash_orientation: string | null;
  stair_carpet_colour: string | null;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean;
  additional_windows_qty: number;
  patio_doors_qty: number;
  window_total: number;
  window_comments?: string | null;
  upgrade_interests: Record<string, boolean>;
  status: string;
  sales_comments: string | null;
  area_upgrades?: AreaUpgrade[];
  upgrade_floor_selection?: string | null;
  backsplash_grout_enabled?: boolean;
  backsplash_grout_color?: string | null;
  backsplash_grout_comments?: string | null;
  heated_floor_bathrooms?: number;
  bathroom_tile_selected?: boolean;
  hardwood_upgrade_selected?: boolean;
}

interface SubmissionEditorProps {
  submission: BuyerSelection;
  onSave: (updatedSubmission: BuyerSelection) => void;
  onCancel: () => void;
}

export function SubmissionEditor({ submission, onSave, onCancel }: SubmissionEditorProps) {
  const [editData, setEditData] = useState<BuyerSelection>({ ...submission });
  const [saving, setSaving] = useState(false);

  // Area names for display
  const AREA_NAMES: Record<string, string> = {
    mainLiving: 'Main Living Area',
    secondBedroom: 'Second Bedroom',
    masterBedroom: 'Master Bedroom',
    secondBedroomCarpet: 'Second Bedroom Carpet',
    guestBathroom: 'Guest Bathroom',
    masterEnsuite: 'Master Ensuite',
    laundry: 'Laundry Room',
    backsplash: 'Kitchen Backsplash',
    allLvp: 'Entire Unit LVP',
    stairs: 'Stairs',
    masterBedroomCarpet: 'Master Bedroom Carpet',
  };

  const MATERIAL_NAMES: Record<string, string> = {
    lvp: 'Premium LVP',
    hardwood: 'Hardwood',
    lvt: 'Premium LVT',
    carpet: 'Premium Carpet',
    tile: 'Porcelain Tile',
    nonstandard_lvp: 'Non Standard LVP Color',
    nonstandard_lvt: 'Non Standard LVT Color',
    nonstandard_tile: 'Non Standard Tile Color',
  };

  const handleChange = <K extends keyof BuyerSelection>(field: K, value: BuyerSelection[K]) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  // Area upgrade handlers
  const addAreaUpgrade = () => {
    const newUpgrade: AreaUpgrade = {
      areaId: 'mainLiving',
      materialType: 'lvp',
      productName: '',
      productColor: '',
      comments: '',
    };
    handleChange('area_upgrades', [...(editData.area_upgrades || []), newUpgrade]);
  };

  const updateAreaUpgrade = (index: number, field: keyof AreaUpgrade, value: string | boolean) => {
    const upgrades = [...(editData.area_upgrades || [])];
    upgrades[index] = { ...upgrades[index], [field]: value };
    handleChange('area_upgrades', upgrades);
  };

  const removeAreaUpgrade = (index: number) => {
    const upgrades = [...(editData.area_upgrades || [])];
    upgrades.splice(index, 1);
    handleChange('area_upgrades', upgrades);
  };

  // Calculate heated floor bathrooms from area upgrades
  const calculateHeatedFloorCount = () => {
    return (editData.area_upgrades || []).filter(u => u.heatedFloor).length;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Calculate heated floor count from area upgrades
      const heatedFloorCount = calculateHeatedFloorCount();

      // Cast area_upgrades to Json-compatible format
      const areaUpgradesJson = (editData.area_upgrades || []).map(upgrade => ({
        areaId: upgrade.areaId,
        materialType: upgrade.materialType,
        productName: upgrade.productName,
        productColor: upgrade.productColor,
        comments: upgrade.comments,
        heatedFloor: upgrade.heatedFloor || false,
      }));

      const updatePayload = {
        // Buyer Info
        first_name: editData.first_name,
        last_name: editData.last_name,
        email: editData.email,
        phone_number: editData.phone_number,
        unit_number: editData.unit_number,
        unit_type: editData.unit_type,
        estimated_possession_date: editData.estimated_possession_date,
        has_stairs: editData.has_stairs,
        
        // Flooring Selections
        lvp_colour: editData.lvp_colour,
        lvp_comments: editData.lvp_comments,
        spc_tile_colour: editData.spc_tile_colour,
        spc_tile_comments: editData.spc_tile_comments,
        
        // Bedroom Flooring
        bedroom_flooring_choice: editData.bedroom_flooring_choice,
        bedroom_carpet_colour: editData.bedroom_carpet_colour,
        bedroom_lvp_colour: editData.bedroom_lvp_colour,
        bedroom_lvp_same_as_main: editData.bedroom_lvp_same_as_main,
        stair_carpet_colour: editData.stair_carpet_colour,
        
        // Backsplash
        backsplash_orientation: editData.backsplash_orientation,
        backsplash_grout_enabled: editData.backsplash_grout_enabled,
        backsplash_grout_color: editData.backsplash_grout_color,
        backsplash_grout_comments: editData.backsplash_grout_comments,
        
        // Window Coverings
        additional_windows_qty: editData.additional_windows_qty,
        patio_doors_qty: editData.patio_doors_qty,
        window_comments: editData.window_comments,
        
        // Area Upgrades - cast to Json type
        area_upgrades: areaUpgradesJson as unknown as import('@/integrations/supabase/types').Json,
        upgrade_floor_selection: editData.upgrade_floor_selection,
        heated_floor_bathrooms: heatedFloorCount,
        
        // Admin
        sales_comments: editData.sales_comments,
        upgrade_interests: editData.upgrade_interests as unknown as import('@/integrations/supabase/types').Json,
      };

      const { error } = await supabase
        .from('buyer_selections')
        .update(updatePayload)
        .eq('id', submission.id);

      if (error) throw error;

      // Update local state with new values
      const updatedSubmission: BuyerSelection = {
        ...submission,
        ...updatePayload,
        area_upgrades: editData.area_upgrades,
        upgrade_interests: editData.upgrade_interests,
        heated_floor_bathrooms: heatedFloorCount,
      };

      toast.success('Submission updated successfully');
      onSave(updatedSubmission);
    } catch (error: any) {
      toast.error('Failed to save changes', {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Save/Cancel */}
      <div className="flex items-center justify-between sticky top-0 bg-background py-2 z-10 border-b border-border -mx-6 px-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Home className="w-5 h-5" />
          Edit Submission - Unit {editData.unit_number}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={['buyer-info', 'flooring', 'area-upgrades']} className="space-y-2">
        {/* Buyer Information */}
        <AccordionItem value="buyer-info" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Buyer Information</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={editData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={editData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={editData.phone_number || ''}
                  onChange={(e) => handleChange('phone_number', e.target.value || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Number</Label>
                <Input
                  value={editData.unit_number}
                  onChange={(e) => handleChange('unit_number', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Type</Label>
                <Select
                  value={editData.unit_type || ''}
                  onValueChange={(value) => handleChange('unit_type', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Possession Date</Label>
                <Input
                  type="date"
                  value={editData.estimated_possession_date || ''}
                  onChange={(e) => handleChange('estimated_possession_date', e.target.value || null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Has Stairs</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={editData.has_stairs}
                    onCheckedChange={(checked) => handleChange('has_stairs', checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {editData.has_stairs ? 'Yes (G/H unit)' : 'No'}
                  </span>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Standard Flooring Selections */}
        <AccordionItem value="flooring" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Sofa className="w-4 h-4" />
              <span>Standard Flooring Selections</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Main Floor LVP */}
              <div className="space-y-2">
                <Label>Main Floor LVP Color</Label>
                <Select
                  value={editData.lvp_colour || ''}
                  onValueChange={(value) => handleChange('lvp_colour', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {LVP_COLORS.map(color => (
                      <SelectItem key={color.id} value={color.name}>{color.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Bathroom SPC Tile */}
              <div className="space-y-2">
                <Label>Bathroom SPC Tile Color</Label>
                <Select
                  value={editData.spc_tile_colour || ''}
                  onValueChange={(value) => handleChange('spc_tile_colour', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select color" />
                  </SelectTrigger>
                  <SelectContent>
                    {TILE_COLORS.map(color => (
                      <SelectItem key={color.id} value={color.name}>{color.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* LVP Comments */}
              <div className="space-y-2 col-span-2">
                <Label>LVP Comments</Label>
                <Textarea
                  value={editData.lvp_comments || ''}
                  onChange={(e) => handleChange('lvp_comments', e.target.value || null)}
                  placeholder="Any notes about LVP selection..."
                  rows={2}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Bedroom Flooring */}
        <AccordionItem value="bedroom" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <BedDouble className="w-4 h-4" />
              <span>Bedroom Flooring</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bedroom Flooring Choice</Label>
                <Select
                  value={editData.bedroom_flooring_choice || ''}
                  onValueChange={(value) => handleChange('bedroom_flooring_choice', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select flooring type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carpet">Carpet</SelectItem>
                    <SelectItem value="lvp">LVP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editData.bedroom_flooring_choice === 'carpet' && (
                <div className="space-y-2">
                  <Label>Bedroom Carpet Color</Label>
                  <Select
                    value={editData.bedroom_carpet_colour || ''}
                    onValueChange={(value) => handleChange('bedroom_carpet_colour', value || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARPET_COLORS.map(color => (
                        <SelectItem key={color.id} value={color.name}>{color.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {editData.bedroom_flooring_choice === 'lvp' && (
                <>
                  <div className="space-y-2">
                    <Label>Same as Main Floor</Label>
                    <div className="flex items-center gap-2 pt-2">
                      <Switch
                        checked={editData.bedroom_lvp_same_as_main}
                        onCheckedChange={(checked) => handleChange('bedroom_lvp_same_as_main', checked)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {editData.bedroom_lvp_same_as_main ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  {!editData.bedroom_lvp_same_as_main && (
                    <div className="space-y-2">
                      <Label>Bedroom LVP Color</Label>
                      <Select
                        value={editData.bedroom_lvp_colour || ''}
                        onValueChange={(value) => handleChange('bedroom_lvp_colour', value || null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select color" />
                        </SelectTrigger>
                        <SelectContent>
                          {LVP_COLORS.map(color => (
                            <SelectItem key={color.id} value={color.name}>{color.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {/* Stair Carpet - only if has_stairs */}
              {editData.has_stairs && (
                <div className="space-y-2">
                  <Label>Stair Carpet Color</Label>
                  <Select
                    value={editData.stair_carpet_colour || ''}
                    onValueChange={(value) => handleChange('stair_carpet_colour', value || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select color" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARPET_COLORS.map(color => (
                        <SelectItem key={color.id} value={color.name}>{color.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Backsplash */}
        <AccordionItem value="backsplash" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              <span>Kitchen Backsplash</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Backsplash Orientation</Label>
                <Select
                  value={editData.backsplash_orientation || ''}
                  onValueChange={(value) => handleChange('backsplash_orientation', value || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select orientation" />
                  </SelectTrigger>
                  <SelectContent>
                    {BACKSPLASH_ORIENTATIONS.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Custom Grout Color</Label>
                <div className="flex items-center gap-2 pt-2">
                  <Switch
                    checked={editData.backsplash_grout_enabled || false}
                    onCheckedChange={(checked) => handleChange('backsplash_grout_enabled', checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {editData.backsplash_grout_enabled ? 'Yes ($300 + GST)' : 'No'}
                  </span>
                </div>
              </div>

              {editData.backsplash_grout_enabled && (
                <>
                  <div className="space-y-2">
                    <Label>Grout Color Name</Label>
                    <Input
                      value={editData.backsplash_grout_color || ''}
                      onChange={(e) => handleChange('backsplash_grout_color', e.target.value || null)}
                      placeholder="e.g., Charcoal Gray"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Grout Comments</Label>
                    <Input
                      value={editData.backsplash_grout_comments || ''}
                      onChange={(e) => handleChange('backsplash_grout_comments', e.target.value || null)}
                      placeholder="Any specific notes..."
                    />
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Window Coverings */}
        <AccordionItem value="windows" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              <span>Window Coverings</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Additional Windows</Label>
                <Input
                  type="number"
                  min={0}
                  value={editData.additional_windows_qty}
                  onChange={(e) => handleChange('additional_windows_qty', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Patio Doors</Label>
                <Input
                  type="number"
                  min={0}
                  value={editData.patio_doors_qty}
                  onChange={(e) => handleChange('patio_doors_qty', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Window Comments</Label>
                <Textarea
                  value={editData.window_comments || ''}
                  onChange={(e) => handleChange('window_comments', e.target.value || null)}
                  placeholder="Any notes about window coverings..."
                  rows={2}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Area Upgrades */}
        <AccordionItem value="area-upgrades" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Bath className="w-4 h-4" />
              <span>Area Upgrades</span>
              {(editData.area_upgrades?.length || 0) > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {editData.area_upgrades?.length} selected
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="space-y-4">
              {/* Floor Selection for G/H units */}
              {editData.has_stairs && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                  <Label>Floor Selection (G/H Units)</Label>
                  <Select
                    value={editData.upgrade_floor_selection || ''}
                    onValueChange={(value) => handleChange('upgrade_floor_selection', value || null)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select floor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st Floor</SelectItem>
                      <SelectItem value="2">2nd Floor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Existing Area Upgrades */}
              {(editData.area_upgrades || []).map((upgrade, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{AREA_NAMES[upgrade.areaId] || upgrade.areaId}</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeAreaUpgrade(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Area</Label>
                      <Select
                        value={upgrade.areaId}
                        onValueChange={(value) => updateAreaUpgrade(index, 'areaId', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AREA_DEFINITIONS.map(area => (
                            <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">Material</Label>
                      <Select
                        value={upgrade.materialType}
                        onValueChange={(value) => updateAreaUpgrade(index, 'materialType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UPGRADE_MATERIALS.map(mat => (
                            <SelectItem key={mat.id} value={mat.id}>{mat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">Product Name</Label>
                      <Input
                        value={upgrade.productName}
                        onChange={(e) => updateAreaUpgrade(index, 'productName', e.target.value)}
                        placeholder="e.g., Mirage Maple"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">Color/Finish</Label>
                      <Input
                        value={upgrade.productColor}
                        onChange={(e) => updateAreaUpgrade(index, 'productColor', e.target.value)}
                        placeholder="e.g., Natural Oak"
                      />
                    </div>
                    
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Comments</Label>
                      <Input
                        value={upgrade.comments}
                        onChange={(e) => updateAreaUpgrade(index, 'comments', e.target.value)}
                        placeholder="Any notes..."
                      />
                    </div>

                    {/* Heated Floor Option for tile types in bathrooms */}
                    {(upgrade.materialType === 'tile' || upgrade.materialType === 'nonstandard_tile') &&
                     (upgrade.areaId === 'guestBathroom' || upgrade.areaId === 'masterEnsuite') && (
                      <div className="col-span-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Flame className="w-4 h-4 text-warning" />
                            <span className="text-sm font-medium">Heated Floor</span>
                            <span className="text-xs text-muted-foreground">($640 + GST)</span>
                          </div>
                          <Switch
                            checked={upgrade.heatedFloor || false}
                            onCheckedChange={(checked) => updateAreaUpgrade(index, 'heatedFloor', checked)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Add New Area Upgrade */}
              <Button
                variant="outline"
                onClick={addAreaUpgrade}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Area Upgrade
              </Button>

              {/* Heated Floors Summary */}
              {calculateHeatedFloorCount() > 0 && (
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-warning" />
                    <span className="font-medium">
                      {calculateHeatedFloorCount()} bathroom(s) with heated floors
                    </span>
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Admin Notes */}
        <AccordionItem value="admin" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>Admin Notes</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6">
            <div className="space-y-2">
              <Label>Sales/Admin Comments</Label>
              <Textarea
                value={editData.sales_comments || ''}
                onChange={(e) => handleChange('sales_comments', e.target.value || null)}
                placeholder="Internal notes about this client..."
                rows={4}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
