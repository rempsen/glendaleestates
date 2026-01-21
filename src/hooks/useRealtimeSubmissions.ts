import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface NewSubmission {
  id: string;
  unit_number: string;
  first_name: string;
  last_name: string;
  created_at: string;
  status: string;
}

interface UseRealtimeSubmissionsOptions {
  onNewSubmission?: (submission: NewSubmission) => void;
  showToasts?: boolean;
  enabled?: boolean;
}

export function useRealtimeSubmissions({
  onNewSubmission,
  showToasts = true,
  enabled = true,
}: UseRealtimeSubmissionsOptions = {}) {
  const handleNewSubmission = useCallback(
    (payload: { new: NewSubmission }) => {
      const newSubmission = payload.new;
      
      if (showToasts) {
        toast.info('New submission received!', {
          description: `Unit ${newSubmission.unit_number} - ${newSubmission.first_name} ${newSubmission.last_name}`,
          action: {
            label: 'View',
            onClick: () => {
              // Navigate to submissions or open details
              window.location.href = '/admin/submissions';
            },
          },
          duration: 10000,
        });
      }

      onNewSubmission?.(newSubmission);
    },
    [onNewSubmission, showToasts]
  );

  const handleStatusChange = useCallback(
    (payload: { old: NewSubmission; new: NewSubmission }) => {
      const { old: oldRecord, new: newRecord } = payload;
      
      if (oldRecord.status !== newRecord.status && showToasts) {
        toast.success('Submission status updated', {
          description: `Unit ${newRecord.unit_number}: ${oldRecord.status} → ${newRecord.status}`,
          duration: 5000,
        });
      }
    },
    [showToasts]
  );

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('buyer-submissions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'buyer_selections',
        },
        (payload) => {
          const newRecord = payload.new as unknown as NewSubmission;
          if (newRecord?.id) {
            handleNewSubmission({ new: newRecord });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'buyer_selections',
        },
        (payload) => {
          const oldRecord = payload.old as unknown as NewSubmission;
          const newRecord = payload.new as unknown as NewSubmission;
          if (newRecord?.id) {
            handleStatusChange({ old: oldRecord, new: newRecord });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime submissions channel subscribed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, handleNewSubmission, handleStatusChange]);
}
