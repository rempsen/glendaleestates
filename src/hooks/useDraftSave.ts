import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

interface DraftData {
  currentStep: number;
  highestStepReached: number;
  selections: Record<string, unknown>;
}

interface UseDraftSaveOptions {
  userId: string | undefined;
  unitNumber: string;
  currentStep: number;
  highestStepReached: number;
  selections: Record<string, unknown>;
  autoSaveIntervalMs?: number;
}

export function useDraftSave({
  userId,
  unitNumber,
  currentStep,
  highestStepReached,
  selections,
  autoSaveIntervalMs = 30000, // Auto-save every 30 seconds
}: UseDraftSaveOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const lastSavedDataRef = useRef<string>('');

  const saveDraft = useCallback(async (showToast = true) => {
    if (!userId || !unitNumber) return;

    const dataToSave = JSON.stringify({ currentStep, highestStepReached, selections });
    
    // Skip if nothing changed
    if (dataToSave === lastSavedDataRef.current) {
      return;
    }

    setIsSaving(true);
    try {
      // Check if draft exists first
      const { data: existingDraft } = await supabase
        .from('buyer_selection_drafts')
        .select('id')
        .eq('user_id', userId)
        .eq('unit_number', unitNumber)
        .maybeSingle();

      let error;
      if (existingDraft) {
        // Update existing
        const result = await supabase
          .from('buyer_selection_drafts')
          .update({
            current_step: currentStep,
            highest_step_reached: highestStepReached,
            selections: selections as Json,
          })
          .eq('id', existingDraft.id);
        error = result.error;
      } else {
        // Insert new
        const result = await supabase
          .from('buyer_selection_drafts')
          .insert([{
            user_id: userId,
            unit_number: unitNumber,
            current_step: currentStep,
            highest_step_reached: highestStepReached,
            selections: selections as Json,
          }]);
        error = result.error;
      }

      if (error) throw error;

      lastSavedDataRef.current = dataToSave;
      setLastSaved(new Date());
      if (showToast) {
        toast.success('Draft saved');
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      if (showToast) {
        toast.error('Failed to save draft');
      }
    } finally {
      setIsSaving(false);
    }
  }, [userId, unitNumber, currentStep, highestStepReached, selections]);

  const loadDraft = useCallback(async (): Promise<DraftData | null> => {
    if (!userId || !unitNumber) return null;

    try {
      const { data, error } = await supabase
        .from('buyer_selection_drafts')
        .select('*')
        .eq('user_id', userId)
        .eq('unit_number', unitNumber)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasLoadedDraft(true);
        lastSavedDataRef.current = JSON.stringify({
          currentStep: data.current_step,
          highestStepReached: data.highest_step_reached,
          selections: data.selections,
        });
        return {
          currentStep: data.current_step ?? 0,
          highestStepReached: data.highest_step_reached ?? 0,
          selections: (data.selections as Record<string, unknown>) ?? {},
        };
      }
      return null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }, [userId, unitNumber]);

  const deleteDraft = useCallback(async () => {
    if (!userId || !unitNumber) return;

    try {
      const { error } = await supabase
        .from('buyer_selection_drafts')
        .delete()
        .eq('user_id', userId)
        .eq('unit_number', unitNumber);

      if (error) throw error;
      lastSavedDataRef.current = '';
      setLastSaved(null);
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }, [userId, unitNumber]);

  // Auto-save effect
  useEffect(() => {
    if (!userId || !unitNumber || autoSaveIntervalMs <= 0) return;

    const interval = setInterval(() => {
      saveDraft(false); // Silent auto-save
    }, autoSaveIntervalMs);

    return () => clearInterval(interval);
  }, [userId, unitNumber, autoSaveIntervalMs, saveDraft]);

  // Save on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (userId && unitNumber) {
        // Use sendBeacon for reliable save on close
        const payload = JSON.stringify({
          user_id: userId,
          unit_number: unitNumber,
          current_step: currentStep,
          highest_step_reached: highestStepReached,
          selections: selections,
        });
        navigator.sendBeacon?.('/api/save-draft', payload);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [userId, unitNumber, currentStep, highestStepReached, selections]);

  return {
    saveDraft,
    loadDraft,
    deleteDraft,
    isSaving,
    lastSaved,
    hasLoadedDraft,
  };
}
