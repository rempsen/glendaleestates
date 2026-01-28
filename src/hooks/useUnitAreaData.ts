import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UnitAreaData {
  id: string;
  unit_type_code: string;
  unit_type_label: string;
  all_lvp: number;
  main_living: number;
  second_bedroom: number;
  master_bedroom_lvp: number;
  master_bedroom: number;
  second_bedroom_carpet: number;
  guest_bathroom: number;
  master_ensuite: number;
  laundry: number;
  backsplash: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Default fallback data matching the original hardcoded values
const DEFAULT_UNIT_AREA_DATA: Record<string, Omit<UnitAreaData, 'id' | 'unit_type_code' | 'unit_type_label' | 'display_order' | 'created_at' | 'updated_at'>> = {
  'A': { all_lvp: 1350, main_living: 250, second_bedroom: 200, master_bedroom_lvp: 250, master_bedroom: 10, second_bedroom_carpet: 20, guest_bathroom: 165, master_ensuite: 80, laundry: 0, backsplash: 30 },
  'B': { all_lvp: 1150, main_living: 250, second_bedroom: 180, master_bedroom_lvp: 250, master_bedroom: 10, second_bedroom_carpet: 20, guest_bathroom: 135, master_ensuite: 75, laundry: 0, backsplash: 25 },
  'C': { all_lvp: 1500, main_living: 360, second_bedroom: 200, master_bedroom_lvp: 360, master_bedroom: 12, second_bedroom_carpet: 24, guest_bathroom: 200, master_ensuite: 80, laundry: 60, backsplash: 25 },
  'D': { all_lvp: 1500, main_living: 360, second_bedroom: 200, master_bedroom_lvp: 360, master_bedroom: 12, second_bedroom_carpet: 24, guest_bathroom: 200, master_ensuite: 80, laundry: 60, backsplash: 25 },
  'E': { all_lvp: 1050, main_living: 200, second_bedroom: 180, master_bedroom_lvp: 200, master_bedroom: 10, second_bedroom_carpet: 22, guest_bathroom: 150, master_ensuite: 60, laundry: 40, backsplash: 25 },
  'F': { all_lvp: 1050, main_living: 200, second_bedroom: 180, master_bedroom_lvp: 200, master_bedroom: 10, second_bedroom_carpet: 22, guest_bathroom: 150, master_ensuite: 60, laundry: 40, backsplash: 25 },
  'G-1': { all_lvp: 700, main_living: 0, second_bedroom: 0, master_bedroom_lvp: 0, master_bedroom: 0, second_bedroom_carpet: 0, guest_bathroom: 200, master_ensuite: 50, laundry: 50, backsplash: 25 },
  'G-2': { all_lvp: 900, main_living: 0, second_bedroom: 0, master_bedroom_lvp: 0, master_bedroom: 14, second_bedroom_carpet: 0, guest_bathroom: 0, master_ensuite: 50, laundry: 0, backsplash: 0 },
  'H-1': { all_lvp: 600, main_living: 0, second_bedroom: 0, master_bedroom_lvp: 0, master_bedroom: 0, second_bedroom_carpet: 0, guest_bathroom: 190, master_ensuite: 50, laundry: 40, backsplash: 25 },
  'H-2': { all_lvp: 675, main_living: 0, second_bedroom: 0, master_bedroom_lvp: 0, master_bedroom: 10, second_bedroom_carpet: 0, guest_bathroom: 0, master_ensuite: 50, laundry: 0, backsplash: 0 },
  'J': { all_lvp: 950, main_living: 200, second_bedroom: 200, master_bedroom_lvp: 200, master_bedroom: 10, second_bedroom_carpet: 22, guest_bathroom: 190, master_ensuite: 70, laundry: 60, backsplash: 25 },
};

export function useUnitAreaData() {
  const [unitAreaData, setUnitAreaData] = useState<UnitAreaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('unit_area_data')
        .select('*')
        .order('display_order');
      
      if (error) throw error;
      setUnitAreaData(data || []);
    } catch (error) {
      console.error('Error fetching unit area data:', error);
      toast.error('Failed to load unit area data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateUnitArea = async (id: string, updates: Partial<UnitAreaData>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('unit_area_data')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
      
      setUnitAreaData(prev => prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
      toast.success('Unit area updated');
    } catch (error) {
      console.error('Error updating unit area:', error);
      toast.error('Failed to update unit area');
    } finally {
      setSaving(false);
    }
  };

  const addUnitArea = async (unitArea: Omit<UnitAreaData, 'id' | 'created_at' | 'updated_at'>) => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('unit_area_data')
        .insert(unitArea)
        .select()
        .single();
      
      if (error) throw error;
      
      setUnitAreaData(prev => [...prev, data].sort((a, b) => a.display_order - b.display_order));
      toast.success('Unit type added');
      return data;
    } catch (error: any) {
      console.error('Error adding unit area:', error);
      if (error.code === '23505') {
        toast.error('A unit type with this code already exists');
      } else {
        toast.error('Failed to add unit type');
      }
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteUnitArea = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('unit_area_data')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setUnitAreaData(prev => prev.filter(item => item.id !== id));
      toast.success('Unit type deleted');
    } catch (error) {
      console.error('Error deleting unit area:', error);
      toast.error('Failed to delete unit type');
    } finally {
      setSaving(false);
    }
  };

  // Helper to get area data for a specific unit type code (with fallback)
  const getAreaForUnitType = useCallback((unitTypeCode: string) => {
    const dbData = unitAreaData.find(d => d.unit_type_code === unitTypeCode);
    if (dbData) {
      return {
        allLvp: Number(dbData.all_lvp),
        mainLiving: Number(dbData.main_living),
        secondBedroom: Number(dbData.second_bedroom),
        masterBedroomLvp: Number((dbData as any).master_bedroom_lvp || 0),
        masterBedroom: Number(dbData.master_bedroom),
        secondBedroomCarpet: Number(dbData.second_bedroom_carpet),
        guestBathroom: Number(dbData.guest_bathroom),
        masterEnsuite: Number(dbData.master_ensuite),
        laundry: Number(dbData.laundry),
        backsplash: Number(dbData.backsplash),
      };
    }
    // Fallback to hardcoded defaults
    return DEFAULT_UNIT_AREA_DATA[unitTypeCode] ? {
      allLvp: DEFAULT_UNIT_AREA_DATA[unitTypeCode].all_lvp,
      mainLiving: DEFAULT_UNIT_AREA_DATA[unitTypeCode].main_living,
      secondBedroom: DEFAULT_UNIT_AREA_DATA[unitTypeCode].second_bedroom,
      masterBedroomLvp: DEFAULT_UNIT_AREA_DATA[unitTypeCode].master_bedroom_lvp,
      masterBedroom: DEFAULT_UNIT_AREA_DATA[unitTypeCode].master_bedroom,
      secondBedroomCarpet: DEFAULT_UNIT_AREA_DATA[unitTypeCode].second_bedroom_carpet,
      guestBathroom: DEFAULT_UNIT_AREA_DATA[unitTypeCode].guest_bathroom,
      masterEnsuite: DEFAULT_UNIT_AREA_DATA[unitTypeCode].master_ensuite,
      laundry: DEFAULT_UNIT_AREA_DATA[unitTypeCode].laundry,
      backsplash: DEFAULT_UNIT_AREA_DATA[unitTypeCode].backsplash,
    } : null;
  }, [unitAreaData]);

  return {
    unitAreaData,
    loading,
    saving,
    refetch: fetchData,
    updateUnitArea,
    addUnitArea,
    deleteUnitArea,
    getAreaForUnitType,
  };
}
