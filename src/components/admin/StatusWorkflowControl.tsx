import { useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle, Clock, FileText, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface StatusTimestamps {
  reviewed_at: string | null;
  quoted_at: string | null;
  completed_at: string | null;
}

interface StatusWorkflowControlProps {
  submissionId: string;
  currentStatus: string;
  timestamps: StatusTimestamps;
  createdAt: string;
  /** `updatedAt`: the row's new `updated_at` (the update trigger bumps it), so the caller's optimistic checks stay current. */
  onStatusChange: (newStatus: string, timestamps: Partial<StatusTimestamps>, updatedAt?: string) => void;
}

const STATUS_CONFIG = [
  { 
    value: 'submitted', 
    label: 'Submitted', 
    icon: Send, 
    color: 'bg-info text-info-foreground',
    description: 'Initial submission received'
  },
  { 
    value: 'reviewed', 
    label: 'Reviewed', 
    icon: FileText, 
    color: 'bg-primary text-primary-foreground',
    description: 'Selection reviewed by admin'
  },
  { 
    value: 'quoted', 
    label: 'Quoted', 
    icon: Clock, 
    color: 'bg-warning text-warning-foreground',
    description: 'Quote sent to buyer'
  },
  { 
    value: 'completed', 
    label: 'Completed', 
    icon: CheckCircle, 
    color: 'bg-success text-success-foreground',
    description: 'Order finalized'
  },
];

export function StatusWorkflowControl({ 
  submissionId, 
  currentStatus, 
  timestamps,
  createdAt,
  onStatusChange 
}: StatusWorkflowControlProps) {
  // QuickBooks is admin-only (spec §6.9): staff status changes never call qbo-sync-submission.
  const { isAdmin } = useRole();
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    
    setUpdating(true);
    try {
      const now = new Date().toISOString();
      const newTimestamps: Partial<StatusTimestamps> = {};
      
      // Set appropriate timestamp based on new status
      switch (newStatus) {
        case 'reviewed':
          if (!timestamps.reviewed_at) newTimestamps.reviewed_at = now;
          break;
        case 'quoted':
          if (!timestamps.reviewed_at) newTimestamps.reviewed_at = now;
          if (!timestamps.quoted_at) newTimestamps.quoted_at = now;
          break;
        case 'completed':
          if (!timestamps.reviewed_at) newTimestamps.reviewed_at = now;
          if (!timestamps.quoted_at) newTimestamps.quoted_at = now;
          if (!timestamps.completed_at) newTimestamps.completed_at = now;
          break;
      }

      const { data, error } = await supabase
        .from('buyer_selections')
        .update({
          status: newStatus,
          ...newTimestamps,
        })
        .eq('id', submissionId)
        .select('updated_at')
        .maybeSingle();

      if (error) throw error;

      onStatusChange(newStatus, newTimestamps, data?.updated_at ?? undefined);
      toast.success(`Status updated to ${newStatus}`);

      // Auto-sync to QuickBooks when entering 'quoted' state.
      if (newStatus === 'quoted' && !isAdmin) {
        toast.info('An admin will sync this quote to QuickBooks.');
      } else if (newStatus === 'quoted') {
        toast.info('Syncing to QuickBooks…');
        supabase.functions.invoke('qbo-sync-submission', {
          body: { submission_id: submissionId },
        }).then(({ data, error: syncErr }) => {
          if (syncErr || (data as { error?: string })?.error) {
            const msg = syncErr?.message || (data as { error?: string })?.error || 'Unknown error';
            toast.error('QuickBooks sync failed', { description: msg });
          } else {
            const docNum = (data as { doc_number?: string })?.doc_number;
            toast.success('QuickBooks Estimate created', {
              description: docNum ? `Estimate #${docNum}` : undefined,
            });
          }
        });
      }
    } catch (error: any) {
      toast.error('Failed to update status', {
        description: error.message,
      });
    } finally {
      setUpdating(false);
    }
  };

  const currentIndex = STATUS_CONFIG.findIndex(s => s.value === currentStatus);

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return null;
    return format(parseISO(ts), 'MMM d, yyyy h:mm a');
  };

  return (
    <div className="space-y-4">
      {/* Status Timeline */}
      <div className="flex items-center justify-between">
        <TooltipProvider>
          {STATUS_CONFIG.map((status, index) => {
            const isActive = status.value === currentStatus;
            const isPast = index < currentIndex;
            const StatusIcon = status.icon;
            
            let timestamp: string | null = null;
            switch (status.value) {
              case 'submitted':
                timestamp = createdAt;
                break;
              case 'reviewed':
                timestamp = timestamps.reviewed_at;
                break;
              case 'quoted':
                timestamp = timestamps.quoted_at;
                break;
              case 'completed':
                timestamp = timestamps.completed_at;
                break;
            }

            return (
              <div key={status.value} className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer',
                        isActive && status.color,
                        isPast && 'bg-muted text-muted-foreground',
                        !isActive && !isPast && 'bg-muted/50 text-muted-foreground/50'
                      )}
                      onClick={() => !updating && handleStatusChange(status.value)}
                    >
                      {updating && isActive ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <StatusIcon className="w-4 h-4" />
                      )}
                      <span className="text-sm font-medium hidden sm:inline">{status.label}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">{status.label}</p>
                    <p className="text-xs text-muted-foreground">{status.description}</p>
                    {timestamp && (
                      <p className="text-xs mt-1">{formatTimestamp(timestamp)}</p>
                    )}
                  </TooltipContent>
                </Tooltip>
                
                {index < STATUS_CONFIG.length - 1 && (
                  <div className={cn(
                    'w-8 h-0.5 mx-1',
                    index < currentIndex ? 'bg-primary' : 'bg-muted'
                  )} />
                )}
              </div>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Timestamps Display */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded bg-muted/30">
          <p className="text-muted-foreground">Submitted</p>
          <p className="font-medium">{formatTimestamp(createdAt)}</p>
        </div>
        {timestamps.reviewed_at && (
          <div className="p-2 rounded bg-muted/30">
            <p className="text-muted-foreground">Reviewed</p>
            <p className="font-medium">{formatTimestamp(timestamps.reviewed_at)}</p>
          </div>
        )}
        {timestamps.quoted_at && (
          <div className="p-2 rounded bg-muted/30">
            <p className="text-muted-foreground">Quoted</p>
            <p className="font-medium">{formatTimestamp(timestamps.quoted_at)}</p>
          </div>
        )}
        {timestamps.completed_at && (
          <div className="p-2 rounded bg-muted/30">
            <p className="text-muted-foreground">Completed</p>
            <p className="font-medium">{formatTimestamp(timestamps.completed_at)}</p>
          </div>
        )}
      </div>

      {/* Quick Status Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Quick change:</span>
        <Select 
          value={currentStatus} 
          onValueChange={handleStatusChange}
          disabled={updating}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_CONFIG.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}