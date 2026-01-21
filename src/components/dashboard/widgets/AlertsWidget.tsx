import { AlertCircle, Clock, FileText, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Alert {
  id: string;
  type: 'new_submission' | 'overdue_review' | 'expiring_quote';
  title: string;
  description: string;
  unitNumber?: string;
  daysOld?: number;
}

interface AlertsWidgetProps {
  submissions: {
    id: string;
    unit_number: string;
    first_name: string;
    last_name: string;
    status: string | null;
    created_at: string;
    reviewed_at?: string | null;
    quoted_at?: string | null;
  }[];
}

export function AlertsWidget({ submissions }: AlertsWidgetProps) {
  const navigate = useNavigate();
  
  // Calculate alerts from submission data
  const alerts: Alert[] = [];
  const now = new Date();
  
  submissions.forEach(sub => {
    const createdAt = new Date(sub.created_at);
    const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    
    // New submissions (less than 24 hours old)
    if (daysSinceCreated === 0 && sub.status === 'submitted') {
      alerts.push({
        id: `new-${sub.id}`,
        type: 'new_submission',
        title: 'New Submission',
        description: `${sub.first_name} ${sub.last_name}`,
        unitNumber: sub.unit_number,
      });
    }
    
    // Overdue reviews (submitted > 3 days ago, not reviewed)
    if (sub.status === 'submitted' && daysSinceCreated > 3) {
      alerts.push({
        id: `overdue-${sub.id}`,
        type: 'overdue_review',
        title: 'Overdue Review',
        description: `${sub.first_name} ${sub.last_name} - Unit ${sub.unit_number}`,
        daysOld: daysSinceCreated,
      });
    }
    
    // Expiring quotes (quoted > 14 days ago without completion)
    if (sub.status === 'quoted' && sub.quoted_at) {
      const quotedAt = new Date(sub.quoted_at);
      const daysSinceQuoted = Math.floor((now.getTime() - quotedAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceQuoted > 14) {
        alerts.push({
          id: `expiring-${sub.id}`,
          type: 'expiring_quote',
          title: 'Expiring Quote',
          description: `${sub.first_name} ${sub.last_name} - Unit ${sub.unit_number}`,
          daysOld: daysSinceQuoted,
        });
      }
    }
  });

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'new_submission':
        return <Bell className="w-4 h-4 text-primary" />;
      case 'overdue_review':
        return <Clock className="w-4 h-4 text-destructive" />;
      case 'expiring_quote':
        return <AlertCircle className="w-4 h-4 text-warning" />;
    }
  };

  const getAlertStyles = (type: Alert['type']) => {
    switch (type) {
      case 'new_submission':
        return 'bg-primary/10 border-primary/20';
      case 'overdue_review':
        return 'bg-destructive/10 border-destructive/20';
      case 'expiring_quote':
        return 'bg-warning/10 border-warning/20';
    }
  };

  if (alerts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <FileText className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No alerts at this time</p>
        <p className="text-xs">All submissions are up to date</p>
      </div>
    );
  }

  // Limit to 5 most important alerts
  const displayAlerts = alerts.slice(0, 5);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 space-y-2 overflow-auto">
        {displayAlerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              'p-3 rounded-lg border transition-colors cursor-pointer hover:opacity-80',
              getAlertStyles(alert.type)
            )}
            onClick={() => navigate('/admin/submissions')}
          >
            <div className="flex items-start gap-3">
              {getAlertIcon(alert.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {alert.title}
                  {alert.unitNumber && (
                    <span className="ml-2 text-muted-foreground">Unit {alert.unitNumber}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {alert.description}
                  {alert.daysOld && ` • ${alert.daysOld} days ago`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {alerts.length > 5 && (
        <div className="pt-2 border-t border-border mt-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => navigate('/admin/submissions')}
          >
            View all {alerts.length} alerts
          </Button>
        </div>
      )}
    </div>
  );
}