import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowRight, 
  Check, 
  X, 
  Plus, 
  Minus,
  Home,
  Sofa,
  BedDouble,
  Bath,
  LayoutGrid
} from 'lucide-react';

// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  heatedFloor?: boolean;
}

// Submission interface
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

interface SubmissionComparisonViewProps {
  original: BuyerSelection;
  current: BuyerSelection;
}

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
};

// Material names for display
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
  premium_carpet_underpad: 'Premium Underpad',
};

// Field labels for display
const FIELD_LABELS: Record<string, string> = {
  unit_number: 'Unit Number',
  unit_type: 'Unit Type',
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone_number: 'Phone',
  estimated_possession_date: 'Possession Date',
  has_stairs: 'Has Stairs',
  lvp_colour: 'Main Floor LVP',
  lvp_comments: 'LVP Comments',
  spc_tile_colour: 'Bathroom/Laundry Tile',
  spc_tile_comments: 'Tile Comments',
  backsplash_orientation: 'Backsplash Orientation',
  stair_carpet_colour: 'Stair Carpet',
  bedroom_flooring_choice: 'Bedroom Flooring Type',
  bedroom_carpet_colour: 'Bedroom Carpet Color',
  bedroom_lvp_colour: 'Bedroom LVP Color',
  bedroom_lvp_same_as_main: 'Bedroom LVP Same as Main',
  additional_windows_qty: 'Additional Windows',
  patio_doors_qty: 'Patio Doors',
  window_total: 'Window Total',
  window_comments: 'Window Comments',
  status: 'Status',
  sales_comments: 'Admin Notes',
  upgrade_floor_selection: 'Floor Selection (G/H)',
  backsplash_grout_enabled: 'Custom Grout Enabled',
  backsplash_grout_color: 'Grout Color',
  backsplash_grout_comments: 'Grout Comments',
  heated_floor_bathrooms: 'Heated Floor Bathrooms',
  bathroom_tile_selected: 'Bathroom Tile Selected',
  hardwood_upgrade_selected: 'Hardwood Upgrade Selected',
};

// Fields to compare (excluding id, created_at, updated_at, and complex objects)
const SIMPLE_FIELDS: (keyof BuyerSelection)[] = [
  'unit_number', 'unit_type', 'first_name', 'last_name', 'email', 'phone_number',
  'estimated_possession_date', 'has_stairs', 'lvp_colour', 'lvp_comments',
  'spc_tile_colour', 'spc_tile_comments', 'backsplash_orientation', 'stair_carpet_colour',
  'bedroom_flooring_choice', 'bedroom_carpet_colour', 'bedroom_lvp_colour', 'bedroom_lvp_same_as_main',
  'additional_windows_qty', 'patio_doors_qty', 'window_total', 'window_comments',
  'status', 'sales_comments', 'upgrade_floor_selection', 'backsplash_grout_enabled',
  'backsplash_grout_color', 'backsplash_grout_comments', 'heated_floor_bathrooms',
  'bathroom_tile_selected', 'hardwood_upgrade_selected',
  'stair_upgrade_type', 'stair_lvp_upgrade_selected', 'stair_premium_carpet_selected', 'premium_underpad_stairs',
  'premium_underpad_bedroom', 'premium_carpet_bedroom', 'custom_tiled_shower', 'automated_windows_qty',
  'bathroom_tile_ensuite_selected', 'bathroom_tile_guest_selected', 'upgrade_comments'
] as (keyof BuyerSelection)[];

interface Change {
  field: string;
  label: string;
  originalValue: string;
  currentValue: string;
  type: 'modified' | 'added' | 'removed';
  category: 'buyer' | 'flooring' | 'bedroom' | 'backsplash' | 'windows' | 'upgrades' | 'admin';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toString();
  return String(value);
}

function getCategory(field: string): Change['category'] {
  if (['unit_number', 'unit_type', 'first_name', 'last_name', 'email', 'phone_number', 'estimated_possession_date', 'has_stairs'].includes(field)) {
    return 'buyer';
  }
  if (['lvp_colour', 'lvp_comments', 'spc_tile_colour', 'spc_tile_comments'].includes(field)) {
    return 'flooring';
  }
  if (['bedroom_flooring_choice', 'bedroom_carpet_colour', 'bedroom_lvp_colour', 'bedroom_lvp_same_as_main', 'stair_carpet_colour'].includes(field)) {
    return 'bedroom';
  }
  if (['backsplash_orientation', 'backsplash_grout_enabled', 'backsplash_grout_color', 'backsplash_grout_comments'].includes(field)) {
    return 'backsplash';
  }
  if (['additional_windows_qty', 'patio_doors_qty', 'window_total', 'window_comments'].includes(field)) {
    return 'windows';
  }
  if (['upgrade_floor_selection', 'heated_floor_bathrooms', 'bathroom_tile_selected', 'hardwood_upgrade_selected'].includes(field)) {
    return 'upgrades';
  }
  return 'admin';
}

function getCategoryIcon(category: Change['category']) {
  switch (category) {
    case 'buyer': return <Home className="w-4 h-4" />;
    case 'flooring': return <Sofa className="w-4 h-4" />;
    case 'bedroom': return <BedDouble className="w-4 h-4" />;
    case 'backsplash': return <LayoutGrid className="w-4 h-4" />;
    case 'windows': return <LayoutGrid className="w-4 h-4" />;
    case 'upgrades': return <Bath className="w-4 h-4" />;
    default: return <LayoutGrid className="w-4 h-4" />;
  }
}

function getCategoryLabel(category: Change['category']): string {
  switch (category) {
    case 'buyer': return 'Buyer Information';
    case 'flooring': return 'Standard Flooring';
    case 'bedroom': return 'Bedroom Flooring';
    case 'backsplash': return 'Backsplash';
    case 'windows': return 'Window Coverings';
    case 'upgrades': return 'Premium Upgrades';
    case 'admin': return 'Admin Notes';
  }
}

export function SubmissionComparisonView({ original, current }: SubmissionComparisonViewProps) {
  const changes = useMemo(() => {
    const result: Change[] = [];

    // Compare simple fields
    for (const field of SIMPLE_FIELDS) {
      const origVal = original[field];
      const currVal = current[field];
      
      // Skip if both are null/undefined or equal
      if (origVal === currVal) continue;
      if ((origVal === null || origVal === undefined) && (currVal === null || currVal === undefined)) continue;
      
      const type: Change['type'] = 
        (origVal === null || origVal === undefined) ? 'added' :
        (currVal === null || currVal === undefined) ? 'removed' : 'modified';
      
      result.push({
        field,
        label: FIELD_LABELS[field] || field,
        originalValue: formatValue(origVal),
        currentValue: formatValue(currVal),
        type,
        category: getCategory(field),
      });
    }

    // Compare area upgrades
    const origUpgrades = original.area_upgrades || [];
    const currUpgrades = current.area_upgrades || [];
    
    // Match rows by area + occurrence so repeated areas (e.g. two Stairs rows) compare correctly
    const keyed = (list: typeof currUpgrades) => {
      const seen: Record<string, number> = {};
      return list.map(u => { const n = (seen[u.areaId] = (seen[u.areaId] ?? -1) + 1); return { u, key: `${u.areaId}#${n}` }; });
    };
    const origKeyed = keyed(origUpgrades);
    const currKeyed = keyed(currUpgrades);
    const priceTxt = (u: any) => (Number(u?.manualPrice) > 0 ? ` — office price $${Number(u.manualPrice).toFixed(2)}` : '');
    // Check for added/modified upgrades
    for (const { u: currUpgrade, key } of currKeyed) {
      const origUpgrade = origKeyed.find(o => o.key === key)?.u;
      
      if (!origUpgrade) {
        result.push({
          field: `area_upgrade_${key}`,
          label: `Area Upgrade: ${AREA_NAMES[currUpgrade.areaId] || currUpgrade.areaId}`,
          originalValue: '—',
          currentValue: `${MATERIAL_NAMES[currUpgrade.materialType] || currUpgrade.materialType} - ${currUpgrade.productColor || 'N/A'}${currUpgrade.heatedFloor ? ' (Heated)' : ''}${priceTxt(currUpgrade)}`,
          type: 'added',
          category: 'upgrades',
        });
      } else {
        // Check if upgrade changed
        const origStr = `${origUpgrade.materialType}|${origUpgrade.productName}|${origUpgrade.productColor}|${origUpgrade.heatedFloor}|${Number((origUpgrade as any).manualPrice) || 0}|${origUpgrade.comments || ''}`;
        const currStr = `${currUpgrade.materialType}|${currUpgrade.productName}|${currUpgrade.productColor}|${currUpgrade.heatedFloor}|${Number((currUpgrade as any).manualPrice) || 0}|${currUpgrade.comments || ''}`;
        
        if (origStr !== currStr) {
          result.push({
            field: `area_upgrade_${key}`,
            label: `Area Upgrade: ${AREA_NAMES[currUpgrade.areaId] || currUpgrade.areaId}`,
            originalValue: `${MATERIAL_NAMES[origUpgrade.materialType] || origUpgrade.materialType} - ${origUpgrade.productColor || 'N/A'}${origUpgrade.heatedFloor ? ' (Heated)' : ''}${priceTxt(origUpgrade)}`,
            currentValue: `${MATERIAL_NAMES[currUpgrade.materialType] || currUpgrade.materialType} - ${currUpgrade.productColor || 'N/A'}${currUpgrade.heatedFloor ? ' (Heated)' : ''}${priceTxt(currUpgrade)}`,
            type: 'modified',
            category: 'upgrades',
          });
        }
      }
    }
    
    // Check for removed upgrades
    for (const { u: origUpgrade, key } of origKeyed) {
      const currUpgrade = currKeyed.find(c => c.key === key)?.u;
      if (!currUpgrade) {
        result.push({
          field: `area_upgrade_${key}`,
          label: `Area Upgrade: ${AREA_NAMES[origUpgrade.areaId] || origUpgrade.areaId}`,
          originalValue: `${MATERIAL_NAMES[origUpgrade.materialType] || origUpgrade.materialType} - ${origUpgrade.productColor || 'N/A'}${origUpgrade.heatedFloor ? ' (Heated)' : ''}`,
          currentValue: '—',
          type: 'removed',
          category: 'upgrades',
        });
      }
    }

    // Compare upgrade interests
    const origInterests = original.upgrade_interests || {};
    const currInterests = current.upgrade_interests || {};
    const allInterestKeys = new Set([...Object.keys(origInterests), ...Object.keys(currInterests)]);
    
    for (const key of allInterestKeys) {
      const origVal = origInterests[key];
      const currVal = currInterests[key];
      
      if (origVal !== currVal) {
        result.push({
          field: `interest_${key}`,
          label: `Interest: ${key.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          originalValue: origVal ? 'Yes' : 'No',
          currentValue: currVal ? 'Yes' : 'No',
          type: currVal && !origVal ? 'added' : !currVal && origVal ? 'removed' : 'modified',
          category: 'upgrades',
        });
      }
    }

    return result;
  }, [original, current]);

  // Group changes by category
  const groupedChanges = useMemo(() => {
    const groups: Record<Change['category'], Change[]> = {
      buyer: [],
      flooring: [],
      bedroom: [],
      backsplash: [],
      windows: [],
      upgrades: [],
      admin: [],
    };

    for (const change of changes) {
      groups[change.category].push(change);
    }

    return groups;
  }, [changes]);

  const totalChanges = changes.length;

  if (totalChanges === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Check className="w-12 h-12 text-green-500 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">No Changes Detected</h3>
        <p className="text-sm text-muted-foreground mt-2">
          The current submission matches the original submission.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">Change Summary</h3>
          <p className="text-sm text-muted-foreground">
            {totalChanges} field{totalChanges !== 1 ? 's' : ''} modified since original submission
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Plus className="w-3 h-3 mr-1" />
            {changes.filter(c => c.type === 'added').length} Added
          </Badge>
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            <ArrowRight className="w-3 h-3 mr-1" />
            {changes.filter(c => c.type === 'modified').length} Modified
          </Badge>
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <Minus className="w-3 h-3 mr-1" />
            {changes.filter(c => c.type === 'removed').length} Removed
          </Badge>
        </div>
      </div>

      {/* Changes by Category */}
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-6">
          {(Object.entries(groupedChanges) as [Change['category'], Change[]][])
            .filter(([_, changes]) => changes.length > 0)
            .map(([category, categoryChanges]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {getCategoryIcon(category)}
                  <span>{getCategoryLabel(category)}</span>
                  <Badge variant="secondary" className="ml-auto">
                    {categoryChanges.length}
                  </Badge>
                </div>
                
                <div className="space-y-2 pl-6">
                  {categoryChanges.map((change) => (
                    <div 
                      key={change.field}
                      className={`p-3 rounded-lg border ${
                        change.type === 'added' 
                          ? 'bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-800' 
                          : change.type === 'removed'
                          ? 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                          : 'bg-yellow-50/50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{change.label}</span>
                        <Badge 
                          variant="outline" 
                          className={
                            change.type === 'added' 
                              ? 'text-green-700 border-green-300' 
                              : change.type === 'removed'
                              ? 'text-red-700 border-red-300'
                              : 'text-yellow-700 border-yellow-300'
                          }
                        >
                          {change.type}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 text-sm">
                        <div className={`flex-1 p-2 rounded ${change.type === 'removed' ? 'bg-red-100/50 dark:bg-red-900/20' : 'bg-muted/50'}`}>
                          <span className="text-xs text-muted-foreground block mb-1">Original</span>
                          <span className={`${change.type === 'removed' ? 'line-through text-red-600' : 'text-foreground'}`}>
                            {change.originalValue}
                          </span>
                        </div>
                        
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        
                        <div className={`flex-1 p-2 rounded ${change.type === 'added' ? 'bg-green-100/50 dark:bg-green-900/20' : 'bg-muted/50'}`}>
                          <span className="text-xs text-muted-foreground block mb-1">Current</span>
                          <span className={`${change.type === 'added' ? 'text-green-600 font-medium' : 'text-foreground'}`}>
                            {change.currentValue}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}
