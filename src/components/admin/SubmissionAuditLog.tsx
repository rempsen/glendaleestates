import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { History, User, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getAuditLogs } from '@/lib/auditLog';
import { auditActionLabel, auditChangeRows } from '@/lib/auditDisplay';

interface AuditLogEntry {
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
}

interface SubmissionAuditLogProps {
  submissionId: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  update: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  status_change: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  client_notes_update: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) return '(none)';
      return `${value.length} item(s)`;
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function SubmissionAuditLog({ submissionId }: SubmissionAuditLogProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const { data, error } = await getAuditLogs(submissionId);
      if (!error) {
        setLogs(data);
      }
      setLoading(false);
    }
    fetchLogs();
  }, [submissionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <History className="w-10 h-10 text-muted-foreground mb-3" />
        <h3 className="font-medium text-foreground mb-1">No Edit History</h3>
        <p className="text-sm text-muted-foreground">
          Changes made to this submission will appear here.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3 pr-4">
        {logs.map((log) => {
          const changeRows = auditChangeRows(log);
          const isExpanded = expandedLogId === log.id;

          return (
            <Collapsible
              key={log.id}
              open={isExpanded}
              onOpenChange={() => setExpandedLogId(isExpanded ? null : log.id)}
            >
              <div className="border rounded-lg bg-card">
                <CollapsibleTrigger asChild>
                  <button className="w-full p-3 text-left hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 rounded-full bg-muted">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {log.changed_by_email || 'System'}
                            </span>
                            <Badge className={ACTION_COLORS[log.action_type] || ACTION_COLORS.update}>
                              {auditActionLabel(log.action_type)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {log.change_summary || `Changed ${changeRows.length} field(s)`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), 'MMM d, yyyy at h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center text-muted-foreground">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                  </button>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  <div className="border-t px-3 py-3 bg-muted/30">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                      Changed Fields
                    </h4>
                    <div className="space-y-2">
                      {changeRows.map((change) => {
                        return (
                          <div key={change.key} className="text-sm">
                            <span className="font-medium text-foreground">
                              {change.label}
                            </span>
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive line-through">
                                {formatValue(change.old)}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                                {formatValue(change.new)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
}
