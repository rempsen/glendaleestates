import { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Submission {
  id: string;
  unit_number: string;
  first_name: string;
  last_name: string;
  estimated_possession_date: string | null;
  status: string | null;
}

interface PossessionCalendarWidgetProps {
  submissions: Submission[];
}

export function PossessionCalendarWidget({ submissions }: PossessionCalendarWidgetProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Group submissions by possession date
  const submissionsByDate = submissions.reduce((acc, sub) => {
    if (sub.estimated_possession_date) {
      const dateKey = sub.estimated_possession_date.split('T')[0];
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(sub);
    }
    return acc;
  }, {} as Record<string, Submission[]>);
  
  // Get submissions for current month
  const monthSubmissions = submissions.filter(sub => {
    if (!sub.estimated_possession_date) return false;
    const date = parseISO(sub.estimated_possession_date);
    return isSameMonth(date, currentMonth);
  });

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'completed': return 'bg-success';
      case 'reviewed': return 'bg-primary';
      case 'quoted': return 'bg-warning';
      default: return 'bg-info';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Badge variant="outline" className="text-xs">
          {monthSubmissions.length} units this month
        </Badge>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 gap-1 text-center">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-xs font-medium text-muted-foreground py-1">
            {day}
          </div>
        ))}
        
        {/* Empty cells for days before month start */}
        {Array.from({ length: monthStart.getDay() }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        
        {/* Days */}
        <TooltipProvider>
          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const daySubmissions = submissionsByDate[dateKey] || [];
            const isToday = isSameDay(day, new Date());
            
            return (
              <Tooltip key={dateKey}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'relative aspect-square flex flex-col items-center justify-center rounded-md text-xs transition-colors',
                      isToday && 'ring-2 ring-primary ring-offset-1',
                      daySubmissions.length > 0 && 'bg-muted/50 cursor-pointer hover:bg-muted'
                    )}
                  >
                    <span className={cn(
                      'text-foreground',
                      daySubmissions.length > 0 && 'font-semibold'
                    )}>
                      {format(day, 'd')}
                    </span>
                    {daySubmissions.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {daySubmissions.slice(0, 3).map((_, i) => (
                          <div 
                            key={i} 
                            className={cn('w-1.5 h-1.5 rounded-full', getStatusColor(daySubmissions[i]?.status))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                {daySubmissions.length > 0 && (
                  <TooltipContent side="top" className="max-w-[200px]">
                    <div className="space-y-1">
                      <p className="font-medium text-xs">{format(day, 'MMMM d, yyyy')}</p>
                      {daySubmissions.map(sub => (
                        <div key={sub.id} className="flex items-center gap-1 text-xs">
                          <Home className="w-3 h-3" />
                          <span>Unit {sub.unit_number}</span>
                          <span className="text-muted-foreground">- {sub.first_name}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Month Summary */}
      {monthSubmissions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-1">
            {monthSubmissions.slice(0, 4).map(sub => (
              <Badge 
                key={sub.id} 
                variant="secondary" 
                className="text-xs"
              >
                <Home className="w-3 h-3 mr-1" />
                {sub.unit_number}
              </Badge>
            ))}
            {monthSubmissions.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{monthSubmissions.length - 4} more
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}