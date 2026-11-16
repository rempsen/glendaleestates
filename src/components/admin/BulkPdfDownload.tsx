import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Download, CalendarIcon, FileText, Loader2, CheckCircle } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { generateSavedSubmissionPdf } from '@/lib/savedSubmissionPdf';
import JSZip from 'jszip';

interface BuyerSubmission {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string;
  estimated_possession_date: string | null;
  created_at: string;
  status: string;
  has_stairs: boolean;
  lvp_colour: string | null;
  lvp_comments: string | null;
  spc_tile_colour: string | null;
  spc_tile_comments: string | null;
  backsplash_orientation: string | null;
  stair_carpet_colour: string | null;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean;
  additional_windows_qty: number;
  patio_doors_qty: number;
  window_total: number;
  window_comments?: string | null;
  upgrade_interests: Record<string, boolean>;
  area_upgrades?: any[];
  upgrade_floor_selection?: string | null;
  backsplash_grout_enabled?: boolean;
  backsplash_grout_color?: string | null;
  backsplash_grout_comments?: string | null;
  heated_floor_bathrooms?: number;
  bathroom_tile_selected?: boolean;
  sales_comments?: string | null;
  admin_notes?: string | null;
}

interface BulkPdfDownloadProps {
  submissions: BuyerSubmission[];
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export function BulkPdfDownload({ submissions }: BulkPdfDownloadProps) {
  const [open, setOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Filter submissions by possession date range
  const filteredSubmissions = submissions.filter(sub => {
    if (!dateRange.from && !dateRange.to) return true;
    if (!sub.estimated_possession_date) return false;
    
    const possessionDate = parseISO(sub.estimated_possession_date);
    const from = dateRange.from || new Date(0);
    const to = dateRange.to || new Date(2100, 0, 1);
    
    return isWithinInterval(possessionDate, { start: from, end: to });
  });

  const toggleAll = () => {
    if (selectedIds.size === filteredSubmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubmissions.map(s => s.id)));
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleGenerate = async () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one submission');
      return;
    }

    setGenerating(true);
    setProgress({ current: 0, total: selectedIds.size });

    try {
      const selectedSubmissions = submissions.filter(s => selectedIds.has(s.id));
      
      if (selectedIds.size === 1) {
        // Single PDF - download directly
        await generateSavedSubmissionPdf(selectedSubmissions[0].id, true, true);
        toast.success('PDF downloaded successfully');
      } else {
        // Multiple PDFs - create ZIP file
        const zip = new JSZip();
        
        for (let i = 0; i < selectedSubmissions.length; i++) {
          const sub = selectedSubmissions[i];
          setProgress({ current: i + 1, total: selectedSubmissions.length });
          
          // Generate PDF as blob using a modified approach
          const pdfBase64 = await generateSavedSubmissionPdf(sub.id, false, true);
          const fileName = `Unit_${sub.unit_number}_${sub.last_name}_${sub.first_name}.pdf`;
          zip.file(fileName, pdfBase64, { base64: true });
        }
        
        // Generate and download ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `BMD_Submissions_${format(new Date(), 'yyyy-MM-dd')}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        toast.success(`Downloaded ${selectedIds.size} PDFs as ZIP`);
      }
      
      setOpen(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Bulk PDF generation error:', error);
      toast.error('Failed to generate PDFs', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Bulk PDF Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Bulk PDF Export
          </DialogTitle>
          <DialogDescription>
            Select submissions by possession date range to export as PDFs
          </DialogDescription>
        </DialogHeader>

        {/* Date Range Filter */}
        <div className="flex items-center gap-4 py-4 border-b border-border">
          <span className="text-sm font-medium">Possession Date:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(!dateRange.from && 'text-muted-foreground')}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {dateRange.from ? format(dateRange.from, 'MMM d, yyyy') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">to</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(!dateRange.to && 'text-muted-foreground')}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {dateRange.to ? format(dateRange.to, 'MMM d, yyyy') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.to}
                onSelect={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {(dateRange.from || dateRange.to) && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setDateRange({ from: undefined, to: undefined })}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Submissions List */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={filteredSubmissions.length > 0 && selectedIds.size === filteredSubmissions.length}
              onCheckedChange={toggleAll}
            />
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} of {filteredSubmissions.length} selected
            </span>
          </div>
          <Badge variant="secondary">
            {filteredSubmissions.length} submissions
          </Badge>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2">
            {filteredSubmissions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No submissions found for selected date range
              </div>
            ) : (
              filteredSubmissions.map(sub => (
                <div
                  key={sub.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                    selectedIds.has(sub.id) 
                      ? 'bg-primary/5 border-primary/20' 
                      : 'bg-muted/30 border-transparent hover:bg-muted/50'
                  )}
                  onClick={() => toggleSelection(sub.id)}
                >
                  <Checkbox
                    checked={selectedIds.has(sub.id)}
                    onCheckedChange={() => toggleSelection(sub.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Unit {sub.unit_number}</span>
                      <Badge variant="outline" className="text-xs">
                        {sub.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {sub.first_name} {sub.last_name}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    {sub.estimated_possession_date ? (
                      <span className="text-muted-foreground">
                        {format(parseISO(sub.estimated_possession_date), 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">No date</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t border-border">
          {generating && (
            <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating PDF {progress.current} of {progress.total}...
            </div>
          )}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={generating || selectedIds.size === 0}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download {selectedIds.size} PDF{selectedIds.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

