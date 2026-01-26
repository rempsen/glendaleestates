import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  submission_id: string;
  changed_by_user_id?: string;
  changed_by_email?: string;
  action_type: 'create' | 'update' | 'delete' | 'status_change';
  changes: Record<string, { old: unknown; new: unknown }>;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  change_summary?: string;
}

// Fields to track for audit logging
const TRACKED_FIELDS = [
  'first_name', 'last_name', 'email', 'phone_number', 'unit_number', 'unit_type',
  'estimated_possession_date', 'has_stairs', 'lvp_colour', 'lvp_comments',
  'spc_tile_colour', 'spc_tile_comments', 'backsplash_orientation',
  'stair_carpet_colour', 'bedroom_flooring_choice', 'bedroom_carpet_colour',
  'bedroom_lvp_colour', 'bedroom_lvp_same_as_main', 'additional_windows_qty',
  'patio_doors_qty', 'window_comments', 'backsplash_grout_enabled',
  'backsplash_grout_color', 'backsplash_grout_comments', 'upgrade_floor_selection',
  'heated_floor_bathrooms', 'sales_comments', 'status', 'area_upgrades'
];

// Field display names for human-readable summaries
const FIELD_DISPLAY_NAMES: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  email: 'Email',
  phone_number: 'Phone',
  unit_number: 'Unit Number',
  unit_type: 'Unit Type',
  estimated_possession_date: 'Possession Date',
  has_stairs: 'Has Stairs',
  lvp_colour: 'LVP Color',
  lvp_comments: 'LVP Comments',
  spc_tile_colour: 'Tile Color',
  spc_tile_comments: 'Tile Comments',
  backsplash_orientation: 'Backsplash Orientation',
  stair_carpet_colour: 'Stair Carpet Color',
  bedroom_flooring_choice: 'Bedroom Flooring',
  bedroom_carpet_colour: 'Bedroom Carpet Color',
  bedroom_lvp_colour: 'Bedroom LVP Color',
  bedroom_lvp_same_as_main: 'Bedroom LVP Same as Main',
  additional_windows_qty: 'Additional Windows',
  patio_doors_qty: 'Patio Doors',
  window_comments: 'Window Comments',
  backsplash_grout_enabled: 'Custom Grout',
  backsplash_grout_color: 'Grout Color',
  backsplash_grout_comments: 'Grout Comments',
  upgrade_floor_selection: 'Upgrade Floor',
  heated_floor_bathrooms: 'Heated Bathrooms',
  sales_comments: 'Admin Notes',
  status: 'Status',
  area_upgrades: 'Area Upgrades',
};

/**
 * Compare two values for equality, handling objects and arrays
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    return aStr === bStr;
  }
  
  return false;
}

/**
 * Calculate changes between original and updated submission
 */
export function calculateChanges(
  original: Record<string, unknown>,
  updated: Record<string, unknown>
): { changes: Record<string, { old: unknown; new: unknown }>; changedFields: string[] } {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  const changedFields: string[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldValue = original[field];
    const newValue = updated[field];

    if (!deepEqual(oldValue, newValue)) {
      changes[field] = { old: oldValue, new: newValue };
      changedFields.push(FIELD_DISPLAY_NAMES[field] || field);
    }
  }

  return { changes, changedFields };
}

/**
 * Create an audit log entry for a submission change
 */
export async function createAuditLog(entry: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current user info
    const { data: { user } } = await supabase.auth.getUser();
    
    const insertData = {
      submission_id: entry.submission_id,
      changed_by_user_id: user?.id || entry.changed_by_user_id || null,
      changed_by_email: user?.email || entry.changed_by_email || null,
      action_type: entry.action_type,
      changes: entry.changes as unknown as import('@/integrations/supabase/types').Json,
      previous_values: entry.previous_values as unknown as import('@/integrations/supabase/types').Json,
      new_values: entry.new_values as unknown as import('@/integrations/supabase/types').Json,
      change_summary: entry.change_summary || null,
    };

    const { error } = await supabase
      .from('submission_audit_logs')
      .insert(insertData);

    if (error) throw error;
    
    return { success: true };
  } catch (error: unknown) {
    console.error('Failed to create audit log:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Fetch audit logs for a submission
 */
export async function getAuditLogs(submissionId: string): Promise<{
  data: Array<{
    id: string;
    submission_id: string;
    changed_by_user_id: string | null;
    changed_by_email: string | null;
    action_type: string;
    changes: Record<string, { old: unknown; new: unknown }>;
    previous_values: Record<string, unknown>;
    new_values: Record<string, unknown>;
    change_summary: string | null;
    created_at: string;
  }>;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('submission_audit_logs')
      .select('*')
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { 
      data: (data || []).map(log => ({
        ...log,
        changes: log.changes as Record<string, { old: unknown; new: unknown }>,
        previous_values: log.previous_values as Record<string, unknown>,
        new_values: log.new_values as Record<string, unknown>,
      }))
    };
  } catch (error: unknown) {
    console.error('Failed to fetch audit logs:', error);
    return { 
      data: [], 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Generate a human-readable summary of changes
 */
export function generateChangeSummary(changedFields: string[]): string {
  if (changedFields.length === 0) return 'No changes';
  if (changedFields.length === 1) return `Updated ${changedFields[0]}`;
  if (changedFields.length === 2) return `Updated ${changedFields[0]} and ${changedFields[1]}`;
  return `Updated ${changedFields.slice(0, -1).join(', ')}, and ${changedFields[changedFields.length - 1]}`;
}
