import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface UpgradeMaterial {
  id: string;
  material_key: string;
  name: string;
  description: string | null;
  cost_per_unit: number;
  unit_type: 'sqft' | 'sqyd' | 'flat';
  is_active: boolean;
  display_order: number;
  parent_material_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface PricingConfig {
  id: string;
  config_key: string;
  config_value: number;
  description: string | null;
  is_percentage: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpgradeLineItem {
  id: string;
  name: string;
  description: string | null;
  cost: number;
  cost_type: 'flat' | 'per_unit' | 'percentage';
  apply_to_material_key: string | null;
  blend_into_material: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function useUpgradePricing() {
  const [materials, setMaterials] = useState<UpgradeMaterial[]>([]);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig[]>([]);
  const [lineItems, setLineItems] = useState<UpgradeLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [materialsRes, configRes, lineItemsRes] = await Promise.all([
        supabase.from('upgrade_materials').select('*').order('display_order'),
        supabase.from('pricing_config').select('*'),
        supabase.from('upgrade_line_items').select('*').order('display_order'),
      ]);

      if (materialsRes.error) throw materialsRes.error;
      if (configRes.error) throw configRes.error;
      if (lineItemsRes.error) throw lineItemsRes.error;

      setMaterials(materialsRes.data as UpgradeMaterial[]);
      setPricingConfig(configRes.data as PricingConfig[]);
      setLineItems(lineItemsRes.data as UpgradeLineItem[]);
    } catch (error) {
      console.error('Error fetching pricing data:', error);
      toast.error('Failed to load pricing configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateMaterial = async (id: string, updates: Partial<UpgradeMaterial>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('upgrade_materials')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
      toast.success('Material updated');
    } catch (error) {
      console.error('Error updating material:', error);
      toast.error('Failed to update material');
    } finally {
      setSaving(false);
    }
  };

  const addMaterial = async (material: Omit<UpgradeMaterial, 'id' | 'created_at' | 'updated_at'>) => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('upgrade_materials')
        .insert(material)
        .select()
        .single();

      if (error) throw error;

      setMaterials(prev => [...prev, data as UpgradeMaterial]);
      toast.success('Material added');
      return data as UpgradeMaterial;
    } catch (error) {
      console.error('Error adding material:', error);
      toast.error('Failed to add material');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteMaterial = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('upgrade_materials')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setMaterials(prev => prev.filter(m => m.id !== id));
      toast.success('Material deleted');
    } catch (error) {
      console.error('Error deleting material:', error);
      toast.error('Failed to delete material');
    } finally {
      setSaving(false);
    }
  };

  const duplicateMaterial = async (material: UpgradeMaterial) => {
    const newMaterial = {
      material_key: `${material.material_key}_copy_${Date.now()}`,
      name: `${material.name} (Copy)`,
      description: material.description,
      cost_per_unit: material.cost_per_unit,
      unit_type: material.unit_type,
      is_active: material.is_active,
      display_order: material.display_order + 1,
      parent_material_key: material.parent_material_key || material.material_key,
    };
    return addMaterial(newMaterial);
  };

  const updatePricingConfig = async (id: string, updates: Partial<Pick<PricingConfig, 'config_value' | 'is_active'>>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pricing_config')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setPricingConfig(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
      toast.success('Configuration updated');
    } catch (error) {
      console.error('Error updating config:', error);
      toast.error('Failed to update configuration');
    } finally {
      setSaving(false);
    }
  };

  const addLineItem = async (lineItem: Omit<UpgradeLineItem, 'id' | 'created_at' | 'updated_at'>) => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('upgrade_line_items')
        .insert(lineItem)
        .select()
        .single();

      if (error) throw error;

      setLineItems(prev => [...prev, data as UpgradeLineItem]);
      toast.success('Line item added');
      return data as UpgradeLineItem;
    } catch (error) {
      console.error('Error adding line item:', error);
      toast.error('Failed to add line item');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateLineItem = async (id: string, updates: Partial<UpgradeLineItem>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('upgrade_line_items')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setLineItems(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
      toast.success('Line item updated');
    } catch (error) {
      console.error('Error updating line item:', error);
      toast.error('Failed to update line item');
    } finally {
      setSaving(false);
    }
  };

  const deleteLineItem = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('upgrade_line_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setLineItems(prev => prev.filter(l => l.id !== id));
      toast.success('Line item deleted');
    } catch (error) {
      console.error('Error deleting line item:', error);
      toast.error('Failed to delete line item');
    } finally {
      setSaving(false);
    }
  };

  // Get the markup percentage from config
  const getMarkupPercentage = () => {
    const config = pricingConfig.find(c => c.config_key === 'markup_percentage');
    return config ? config.config_value / 100 : 0.6;
  };

  // Get the GST rate from config
  const getGstRate = () => {
    const config = pricingConfig.find(c => c.config_key === 'gst_rate');
    return config ? config.config_value / 100 : 0.05;
  };

  return {
    materials,
    pricingConfig,
    lineItems,
    loading,
    saving,
    refetch: fetchData,
    updateMaterial,
    addMaterial,
    deleteMaterial,
    duplicateMaterial,
    updatePricingConfig,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    getMarkupPercentage,
    getGstRate,
  };
}
