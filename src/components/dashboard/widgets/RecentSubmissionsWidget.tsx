import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';

interface Submission {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  status: string | null;
  window_subtotal: number; // pre-GST, from the pricing engine
}

interface RecentSubmissionsWidgetProps {
  submissions: Submission[];
}

export function RecentSubmissionsWidget({ submissions }: RecentSubmissionsWidgetProps) {
  if (submissions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No submissions yet
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border">
              <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Unit</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Buyer</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Window (pre-GST)</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((submission) => (
              <tr key={submission.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-2 px-2">
                  <p className="font-medium text-sm text-foreground">{submission.unit_number}</p>
                  <p className="text-xs text-muted-foreground">{submission.unit_type || 'N/A'}</p>
                </td>
                <td className="py-2 px-2">
                  <p className="text-sm text-foreground truncate max-w-[120px]">
                    {submission.first_name} {submission.last_name}
                  </p>
                </td>
                <td className="py-2 px-2">
                  <StatusBadge status={submission.status || 'submitted'} />
                </td>
                <td className="py-2 px-2 text-right">
                  {submission.window_subtotal > 0 ? (
                    <span className="text-sm font-medium text-foreground">
                      ${submission.window_subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-3 border-t border-border mt-auto">
        <Link to="/admin/submissions">
          <Button variant="ghost" size="sm" className="w-full gap-1">
            View All Submissions
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
