import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { lvpOptions, spcTileOptions, carpetOptions, resolveOptionName } from '@/lib/mockData';
import { generateSavedSubmissionPdf } from '@/lib/savedSubmissionPdf';
import { Search, Download, CheckCircle2, XCircle, Eye, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { loadProjectManagementData } from '@/lib/projectManagementData';

interface BuyerSelection {
  id: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  status: string | null;
  lvp_colour: string | null;
  lvp_comments: string | null;
  spc_tile_colour: string | null;
  spc_tile_comments: string | null;
  backsplash_orientation: string | null;
  stair_carpet_colour: string | null;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean | null;
  has_stairs: boolean | null;
  additional_windows_qty: number | null;
  patio_doors_qty: number | null;
  window_total: number | null;
  window_comments: string | null;
  upgrade_interests: Record<string, boolean> | null;
  created_at: string;
}

export default function AdminHomes() {
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  const [totalsById, setTotalsById] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<BuyerSelection | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubmissions = async () => {
      const [{ data, error }, pm] = await Promise.all([
        supabase
          .from('buyer_selections')
          .select('*')
          .order('created_at', { ascending: false }),
        loadProjectManagementData().catch((e) => { console.error('PM totals load failed', e); return null; }),
      ]);

      if (!error && data) {
        setSubmissions(data as BuyerSelection[]);
      }
      if (pm) {
        const map: Record<string, number> = {};
        pm.units.forEach((u) => { map[u.submission_id] = u.grand_total; });
        setTotalsById(map);
      }
      setLoading(false);
    };

    fetchSubmissions();
  }, []);

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      const matchesSearch = 
        s.unit_number.toLowerCase().includes(search.toLowerCase()) || 
        s.first_name.toLowerCase().includes(search.toLowerCase()) || 
        s.last_name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [submissions, search, statusFilter]);

  const handleExportCSV = () => {
    const csv = [
      ['Unit', 'Unit Type', 'First Name', 'Last Name', 'Email', 'Status', 'LVP Colour', 'SPC Tile', 'Additional Windows', 'Patio Doors', 'Upgrades Total (incl. GST)'].join(','),
      ...filteredSubmissions.map(s => [
        s.unit_number, 
        s.unit_type || '', 
        s.first_name, 
        s.last_name, 
        s.email, 
        s.status || 'submitted', 
        s.lvp_colour || '', 
        s.spc_tile_colour || '', 
        s.additional_windows_qty || 0, 
        s.patio_doors_qty || 0, 
        (totalsById[s.id] ?? 0).toFixed(2)
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'glendale-submissions-export.csv'; a.click();
  };

  const handleGeneratePDF = async (submission: BuyerSelection) => {
    setGeneratingPDF(submission.id);
    try {
      await generateSavedSubmissionPdf(submission.id, true, true);
      toast.success('PDF generated successfully', { description: `${submission.unit_number} selection summary downloaded.` });
    } catch (error) {
      toast.error('Failed to generate PDF');
      console.error(error);
    } finally {
      setGeneratingPDF(null);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">All Submissions</h1>
            <p className="text-muted-foreground mt-1">{filteredSubmissions.length} of {submissions.length} submissions</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" />Export to CSV
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">Unit</th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Flooring</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Windows</th>
                  <th className="text-right py-4 px-4 text-sm font-medium text-muted-foreground">Total</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No submissions found
                    </td>
                  </tr>
                ) : (
                  filteredSubmissions.map((submission) => (
                    <tr key={submission.id} className="border-t border-border hover:bg-muted/30">
                      <td className="py-4 px-4">
                        <p className="font-medium text-foreground">{submission.unit_number}</p>
                        <p className="text-sm text-muted-foreground">{submission.unit_type || 'N/A'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-foreground">{submission.first_name} {submission.last_name}</p>
                        <p className="text-xs text-muted-foreground">{submission.email}</p>
                      </td>
                      <td className="py-4 px-4"><StatusBadge status={submission.status || 'submitted'} /></td>
                      <td className="py-4 px-4 text-center">
                        {submission.lvp_colour && submission.spc_tile_colour ? <CheckCircle2 className="w-5 h-5 text-success mx-auto" /> : <XCircle className="w-5 h-5 text-muted-foreground mx-auto" />}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {(submission.additional_windows_qty || 0) > 0 || (submission.patio_doors_qty || 0) > 0 ? <CheckCircle2 className="w-5 h-5 text-success mx-auto" /> : <XCircle className="w-5 h-5 text-muted-foreground mx-auto" />}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {(() => {
                          const total = totalsById[submission.id] ?? 0;
                          return total > 0
                            ? <span className="font-medium">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            : <span className="text-muted-foreground">—</span>;
                        })()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedSubmission(submission)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleGeneratePDF(submission)}
                            disabled={generatingPDF === submission.id}
                            title="Download PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedSubmission && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl">{selectedSubmission.unit_number} — {selectedSubmission.unit_type || 'N/A'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="p-4 rounded-lg bg-secondary/30">
                    <h4 className="font-medium text-foreground mb-2">Buyer</h4>
                    <p className="text-sm text-foreground">{selectedSubmission.first_name} {selectedSubmission.last_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedSubmission.email}</p>
                    {selectedSubmission.phone_number && <p className="text-sm text-muted-foreground">{selectedSubmission.phone_number}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <StatusBadge status={selectedSubmission.status || 'submitted'} />
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-medium text-foreground">Selections</h4>
                    <div className="grid gap-3 text-sm">
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Main Floor LVP</span>
                        <span className="font-medium">{resolveOptionName(lvpOptions, selectedSubmission.lvp_colour) || 'Not selected'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Bathroom SPC</span>
                        <span className="font-medium">{resolveOptionName(spcTileOptions, selectedSubmission.spc_tile_colour) || 'Not selected'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Backsplash</span>
                        <span className="font-medium capitalize">{selectedSubmission.backsplash_orientation || 'Not selected'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Stair Flooring</span>
                        <span className="font-medium">{(() => {
                          const x = selectedSubmission as any;
                          if (!x.has_stairs) return 'N/A (no stairs)';
                          const t = x.stair_upgrade_type || (x.stair_lvp_upgrade_selected ? 'lvp' : 'standard');
                          if (t === 'premium_lvp') return 'Premium LVP upgrade (custom nosings)';
                          if (t === 'lvp') return 'LVP upgrade (custom nosings)';
                          const c = resolveOptionName(carpetOptions, x.stair_carpet_colour) || 'Standard carpet';
                          return x.stair_premium_carpet_selected ? `Premium carpet — ${c}` : c;
                        })()}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Bedroom Flooring</span>
                        <span className="font-medium capitalize">{selectedSubmission.bedroom_flooring_choice || 'Not selected'}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Additional Windows</span>
                        <span className="font-medium">{selectedSubmission.additional_windows_qty || 0}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-border">
                        <span className="text-muted-foreground">Patio Doors</span>
                        <span className="font-medium">{selectedSubmission.patio_doors_qty || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Comments Section */}
                  {(selectedSubmission.lvp_comments || selectedSubmission.spc_tile_comments || selectedSubmission.window_comments) && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Notes & Comments</h4>
                      <div className="space-y-3">
                        {selectedSubmission.lvp_comments && (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">Flooring Notes</p>
                            <p className="text-sm">{selectedSubmission.lvp_comments}</p>
                          </div>
                        )}
                        {selectedSubmission.spc_tile_comments && (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">Tile Notes</p>
                            <p className="text-sm">{selectedSubmission.spc_tile_comments}</p>
                          </div>
                        )}
                        {selectedSubmission.window_comments && (
                          <div className="p-3 rounded-lg bg-muted/50">
                            <p className="text-xs text-muted-foreground mb-1">Window Covering Notes</p>
                            <p className="text-sm">{selectedSubmission.window_comments}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {(totalsById[selectedSubmission.id] ?? 0) > 0 && (
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                      <h4 className="font-medium text-foreground mb-1">Upgrades Total (incl. GST)</h4>
                      <p className="text-2xl font-serif font-semibold text-primary">${(totalsById[selectedSubmission.id] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  )}

                  {/* PDF Download Button */}
                  <Button 
                    onClick={() => handleGeneratePDF(selectedSubmission)} 
                    disabled={generatingPDF === selectedSubmission.id}
                    className="w-full gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    {generatingPDF === selectedSubmission.id ? 'Generating PDF...' : 'Download Selection Summary PDF'}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}