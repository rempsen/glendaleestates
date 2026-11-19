import { useState, useEffect, useRef } from 'react';
import { useRole } from '@/hooks/useRole';
import { summarizeBulkDelete } from '@/lib/bulkDelete';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Search, Eye, RefreshCw, Home, Download, Pencil, Save, X, DollarSign, Trash2, Mail, GitCompare, History, Send, AlertTriangle } from 'lucide-react';
import { generateSavedSubmissionPdf, loadSavedSubmissionContext } from '@/lib/savedSubmissionPdf';
import { format } from 'date-fns';
import { SECTION_ORDER } from '@/lib/quoteLines';
import { SECTION_LABELS } from '@/lib/addLinePresets';
import { useSubmissionLineTotals } from '@/hooks/useSubmissionLineTotals';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { StatusWorkflowControl } from '@/components/admin/StatusWorkflowControl';
import { SubmissionEditor } from '@/components/admin/SubmissionEditor';
import { SubmissionComparisonView } from '@/components/admin/SubmissionComparisonView';
import { SubmissionAuditLog } from '@/components/admin/SubmissionAuditLog';
import { UpgradeRequestSummary } from '@/components/admin/UpgradeRequestSummary';
import { EmailPreviewDialog } from '@/components/admin/EmailPreviewDialog';
import { generateEmailPreviewHtml } from '@/lib/emailPreview';

// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
  clientComment?: string;
  heatedFloor?: boolean;
}

// Area name mapping for display
const AREA_NAMES: Record<string, string> = {
  mainLiving: 'Main Living Area',
  secondBedroom: 'Second Bedroom',
  masterBedroom: 'Master Bedroom',
  secondBedroomCarpet: 'Second Bedroom Carpet',
  guestBathroom: 'Guest Bathroom',
  masterEnsuite: 'Master Ensuite',
  laundry: 'Laundry Room',
  backsplash: 'Kitchen Backsplash',
  allLvp: 'Entire Unit LVP',
};

// Material type display names
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  carpet: 'Premium Carpet',
  tile: 'Porcelain Tile',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
  premium_carpet_underpad: 'Premium Underpad',
};

interface BuyerSelection {
  id: string;
  created_at: string;
  updated_at: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string;
  estimated_possession_date: string | null;
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
  window_comments?: string | null;
  upgrade_interests: Record<string, boolean>;
  status: string;
  reviewed_at?: string | null;
  quoted_at?: string | null;
  completed_at?: string | null;
  sales_comments: string | null;
  upgrade_comments?: string | null;
  upgrade_interests_notes?: string | null;
  // New upgrade fields
  area_upgrades?: AreaUpgrade[];
  upgrade_floor_selection?: string | null;
  backsplash_grout_enabled?: boolean;
  backsplash_grout_color?: string | null;
  backsplash_grout_comments?: string | null;
  heated_floor_bathrooms?: number;
  bathroom_tile_selected?: boolean;
  hardwood_upgrade_selected?: boolean;
}

const statusColors: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  reviewed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  // AI summaries run in the admin-checked summarize-upgrade-requests function (AGENTS.md): admins only.
  const { isAdmin } = useRole();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<BuyerSelection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<BuyerSelection>>({});
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resyncingComments, setResyncingComments] = useState(false);
  const [originalSubmission, setOriginalSubmission] = useState<BuyerSelection | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'compare' | 'history'>('details');
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailPreviewHtml, setEmailPreviewHtml] = useState('');

  const [resendingPdf, setResendingPdf] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>('');
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);

  // Flat rates shown next to selections (display only; amounts come from quote lines).
  const { getStairLvpUpgradePrice, getGroutColorChangePrice } = useDynamicPricing();

  // Every figure on this page comes from quote lines (stored, else generated), summed by sumQuoteLines.
  const lineTotals = useSubmissionLineTotals(submissions);

  const fetchSubmissions = async () => {
    setLoading(true);
    setSelectedIds(new Set()); // Clear selection on refresh
    try {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type assertion for JSONB fields
      const typedData = (data || []).map(item => ({
        ...item,
        upgrade_interests: (item.upgrade_interests as unknown as Record<string, boolean>) || {},
        area_upgrades: (item.area_upgrades as unknown as AreaUpgrade[]) || [],
      })) as BuyerSelection[];
      
      setSubmissions(typedData);
    } catch (error: any) {
      toast.error('Failed to load submissions', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const filteredSubmissions = submissions.filter(s => {
    const matchesSearch = 
      s.unit_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const openDetails = async (submission: BuyerSelection) => {
    setSelectedSubmission(submission);
    // Rebuild the as-submitted record from the change history: the oldest "old"
    // value of each field is what the buyer originally submitted.
    setOriginalSubmission({ ...submission });
    supabase.from('submission_audit_logs').select('changes, created_at')
      .eq('submission_id', submission.id).order('created_at', { ascending: true })
      .then(({ data }) => {
        const orig: Record<string, unknown> = { ...submission };
        const seen = new Set<string>();
        for (const log of data || []) {
          const ch = (log as any).changes || {};
          for (const [field, v] of Object.entries(ch)) {
            if (seen.has(field) || !v || typeof v !== 'object' || !('old' in (v as any))) continue;
            seen.add(field);
            orig[field] = (v as any).old;
          }
        }
        setOriginalSubmission(orig as unknown as BuyerSelection);
      });
    setEditMode(false);
    setActiveTab('details');
    setDetailsOpen(true);
  };

  // Re-fetch upgrade_comments and upgrade_interests_notes from the database
  // and refresh the open detail view. Useful after a backfill/repair job.
  const resyncCommentsFromDb = async () => {
    if (!selectedSubmission) return;
    setResyncingComments(true);
    try {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('upgrade_comments, upgrade_interests_notes')
        .eq('id', selectedSubmission.id)
        .single();

      if (error) throw error;

      const patch = {
        upgrade_comments: (data as any)?.upgrade_comments ?? null,
        upgrade_interests_notes: (data as any)?.upgrade_interests_notes ?? null,
      };

      setSelectedSubmission((prev) => (prev ? ({ ...prev, ...patch } as any) : prev));
      setOriginalSubmission((prev) => (prev ? ({ ...prev, ...patch } as any) : prev));
      setSubmissions((prev) =>
        prev.map((s) => (s.id === selectedSubmission.id ? ({ ...s, ...patch } as any) : s)),
      );

      const found = [
        patch.upgrade_comments ? 'Upgrade Pricing Summary comments' : null,
        patch.upgrade_interests_notes ? 'Upgrade Interests notes' : null,
      ].filter(Boolean);

      if (found.length === 0) {
        toast.info('No comments found in the database for this submission.');
      } else {
        toast.success(`Re-synced: ${found.join(' + ')}`);
      }
    } catch (error: any) {
      toast.error('Failed to re-sync comments', { description: error.message });
    } finally {
      setResyncingComments(false);
    }
  };

  // Open email preview — renders the EXACT HTML the buyer will receive
  // by asking the resend-confirmation-email function for a preview build.
  const openEmailPreview = async () => {
    if (!selectedSubmission) return;
    try {
      setEmailPreviewHtml('<p style="padding:24px;font-family:sans-serif;color:#555">Loading preview…</p>');
      setEmailPreviewOpen(true);
      const { data, error } = await supabase.functions.invoke('resend-confirmation-email', {
        body: {
          submissionId: selectedSubmission.id,
          preview: true,
          previewType: 'buyer',
          editedBy: 'Admin (Preview)',
        },
      });
      if (error) throw error;
      if (!data?.html) throw new Error('No preview HTML returned');
      setEmailPreviewHtml(data.html);
    } catch (err: any) {
      console.error('Preview failed:', err);
      toast.error('Failed to load email preview', { description: err?.message || 'Unknown error' });
      // Fallback: local preview from the submission's quote lines (same fresh-record loader as the PDF)
      try {
        const { lines, gstRate } = await loadSavedSubmissionContext(selectedSubmission.id);
        setEmailPreviewHtml(generateEmailPreviewHtml(selectedSubmission, { lines, gstRate, pricesAvailable: true }));
      } catch (fallbackErr) {
        console.error('Local preview failed:', fallbackErr);
        setEmailPreviewHtml('<p style="padding:24px;font-family:sans-serif;color:#555">Preview unavailable.</p>');
      }
    }
  };

  // Resend confirmation email
  const resendConfirmationEmail = async () => {
    if (!selectedSubmission) return;
    
    setSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('resend-confirmation-email', {
        body: {
          submissionId: selectedSubmission.id,
          sendToBuyer: true,
          editedBy: 'Admin',
        },
      });

      if (error) throw error;

      toast.success('Confirmation email sent', {
        description: `Email sent to ${selectedSubmission.email}`,
      });
    } catch (error: any) {
      console.error('Failed to send email:', error);
      toast.error('Failed to send email', {
        description: error.message || 'Unknown error',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // Build the buyer PDF for a submission using EXACTLY the same pricing
  // config + selection mapping that the emailed PDF uses. Returned as a
  // base64 string so it can be either emailed (resend flow) or rendered in
  // the in-portal PDF preview dialog. Centralised so the preview and the
  // outbound file can never drift apart.
  const buildBuyerPdfBase64 = async (sub: BuyerSelection): Promise<string> => {
    return generateSavedSubmissionPdf(sub.id);
  };

  // Open in-portal PDF preview — uses the EXACT same generator & pricing
  // path as the emailed buyer PDF, so what admins see here is what buyers
  // receive.
  const openPdfPreview = async () => {
    if (!selectedSubmission) return;
    setPdfPreviewOpen(true);
    setPdfPreviewLoading(true);
    setPdfPreviewUrl('');
    try {
      const b64 = await buildBuyerPdfBase64(selectedSubmission);
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setPdfPreviewUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      toast.error('Failed to render PDF preview', { description: err?.message || 'Unknown error' });
      setPdfPreviewOpen(false);
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  // Re-send a corrected selection summary PDF to the buyer.
  const resendCorrectedPdf = async () => {
    if (!selectedSubmission) return;
    setResendingPdf(true);
    try {
      const sub = selectedSubmission;
      // Use the SAME helper that powers the in-portal PDF preview so the
      // emailed PDF and the previewed PDF are byte-for-byte identical.
      const pdfBase64 = await buildBuyerPdfBase64(sub);

      // Identify which captured comments are now being delivered
      const labels: string[] = [];
      if (sub.lvp_comments) labels.push('Main Floor LVP comments');
      if (sub.spc_tile_comments) labels.push('Bathroom Tile comments');
      if (sub.window_comments) labels.push('Window Coverings comments');
      if (sub.backsplash_grout_comments) labels.push('Backsplash Grout comments');
      if ((sub.area_upgrades || []).some(u => u.comments || u.clientComment)) labels.push('Per-area upgrade comments');
      if ((sub as any).upgrade_comments) labels.push('Upgrade Pricing Summary comments');
      if ((sub as any).upgrade_interests_notes) labels.push('Upgrade Interests notes');

      const { data, error } = await supabase.functions.invoke('resend-corrected-summary', {
        body: {
          submissionId: sub.id,
          email: sub.email,
          firstName: sub.first_name,
          lastName: sub.last_name,
          unitNumber: sub.unit_number,
          pdfBase64,
          pdfFileName: `Unit-${sub.unit_number}-Selection-Summary-Updated.pdf`,
          capturedCommentLabels: labels,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Updated PDF emailed to buyer', {
        description: `Sent to ${sub.email}`,
      });
    } catch (err: any) {
      console.error('Resend corrected PDF failed:', err);
      toast.error('Failed to resend updated PDF', {
        description: err?.message || 'Unknown error',
      });
    } finally {
      setResendingPdf(false);
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSubmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubmissions.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const deleteSelectedSubmissions = async () => {
    if (selectedIds.size === 0) return;
    
    setDeleting(true);
    try {
      const requested = Array.from(selectedIds);
      const { data, error } = await supabase
        .from('buyer_selections')
        .delete()
        .in('id', requested)
        .select('id');

      if (error) throw error;

      const outcome = summarizeBulkDelete(requested, data);
      setSubmissions(prev => prev.filter(s => !outcome.deletedIds.has(s.id)));
      if (outcome.kind === 'success') toast.success(outcome.message);
      else toast.error(outcome.message);
      setSelectedIds(new Set(requested.filter(id => !outcome.deletedIds.has(id))));
      setDeleteDialogOpen(false);
    } catch (error: any) {
      toast.error('Failed to delete submissions', {
        description: error.message,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Buyer Submissions</h1>
            <p className="text-muted-foreground">
              {submissions.length} total submissions
              {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && selectedIds.size > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" onClick={fetchSubmissions} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by unit, name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={filteredSubmissions.length > 0 && selectedIds.size === filteredSubmissions.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading submissions...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No submissions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(submission.id)}
                        onCheckedChange={() => toggleSelect(submission.id)}
                        aria-label={`Select ${submission.first_name} ${submission.last_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{submission.unit_number}</div>
                      {submission.unit_type && (
                        <div className="text-xs text-muted-foreground">{submission.unit_type}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {submission.first_name} {submission.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {submission.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(submission.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[submission.status] || statusColors.draft}>
                        {submission.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/admin/quotes/${submission.id}`}>Open quote</Link>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openDetails(submission)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={(open) => {
        setDetailsOpen(open);
        if (!open) setEditMode(false);
      }}>
        <DialogContent className={editMode ? "max-w-4xl max-h-[90vh] overflow-y-auto" : "max-w-2xl max-h-[80vh] overflow-y-auto"}>
          {selectedSubmission && (
            <>
              {editMode ? (
                // Full Editor Mode
                <SubmissionEditor
                  submission={selectedSubmission}
                  onSaved={(updatedSubmission) => {
                    setSubmissions(prev => prev.map(s => s.id === updatedSubmission.id ? updatedSubmission : s));
                    setSelectedSubmission(updatedSubmission);
                  }}
                  onSave={(updatedSubmission) => {
                    setSubmissions(prev => 
                      prev.map(s => s.id === updatedSubmission.id ? updatedSubmission : s)
                    );
                    setSelectedSubmission(updatedSubmission);
                    setEditMode(false);
                  }}
                  onCancel={() => setEditMode(false)}
                />
              ) : (
                // View Mode
                <>
                  <DialogHeader>
                    <div className="flex items-center justify-between">
                      <DialogTitle className="flex items-center gap-2">
                        <Home className="w-5 h-5" />
                        Unit {selectedSubmission.unit_number}
                        {selectedSubmission.unit_type && (
                          <Badge variant="outline">{selectedSubmission.unit_type}</Badge>
                        )}
                      </DialogTitle>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={openEmailPreview}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Preview Email
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={openPdfPreview}
                          disabled={pdfPreviewLoading}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          {pdfPreviewLoading ? 'Rendering…' : 'Preview PDF'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={resendConfirmationEmail}
                          disabled={sendingEmail}
                        >
                          {sendingEmail ? (
                            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                          ) : (
                            <Mail className="w-4 h-4 mr-1" />
                          )}
                          {sendingEmail ? 'Sending...' : 'Send Email'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </div>
                    <DialogDescription>
                      Submitted {format(new Date(selectedSubmission.created_at), 'MMMM d, yyyy at h:mm a')}
                    </DialogDescription>
                    <StatusWorkflowControl
                      submissionId={selectedSubmission.id}
                      currentStatus={selectedSubmission.status}
                      createdAt={selectedSubmission.created_at}
                      timestamps={{
                        reviewed_at: selectedSubmission.reviewed_at ?? null,
                        quoted_at: selectedSubmission.quoted_at ?? null,
                        completed_at: selectedSubmission.completed_at ?? null,
                      }}
                      onStatusChange={(newStatus, timestamps) => {
                        const patch: Partial<BuyerSelection> = { status: newStatus, ...timestamps };
                        setSubmissions(prev =>
                          prev.map(s => s.id === selectedSubmission.id ? { ...s, ...patch } : s)
                        );
                        setSelectedSubmission(prev => prev ? { ...prev, ...patch } : null);
                      }}
                    />
                  </DialogHeader>

                  {/* Tabs for Details vs Compare vs History */}
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'details' | 'compare' | 'history')} className="mt-4">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="compare" className="flex items-center gap-1">
                        <GitCompare className="w-3 h-3" />
                        Changes
                      </TabsTrigger>
                      <TabsTrigger value="history" className="flex items-center gap-1">
                        <History className="w-3 h-3" />
                        Audit Log
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="compare" className="mt-4">
                      {originalSubmission && (
                        <SubmissionComparisonView 
                          original={originalSubmission} 
                          current={selectedSubmission} 
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="history" className="mt-4">
                      <SubmissionAuditLog submissionId={selectedSubmission.id} />
                    </TabsContent>
                    
                    <TabsContent value="details" className="mt-4">
              <div className="space-y-6">
                {isAdmin && <UpgradeRequestSummary key={selectedSubmission.id} submissionId={selectedSubmission.id} />}
                {/* Missing-comments warning banner */}
                {(() => {
                  const sub = selectedSubmission as any;
                  const hasUpgradeActivity =
                    (sub.area_upgrades && sub.area_upgrades.length > 0) ||
                    !!sub.bathroom_tile_selected ||
                    !!sub.hardwood_upgrade_selected ||
                    !!sub.custom_tiled_shower ||
                    (sub.heated_floor_bathrooms ?? 0) > 0 ||
                    !!sub.backsplash_grout_enabled ||
                    !!sub.stair_lvp_upgrade_selected ||
                    !!sub.premium_carpet_bedroom ||
                    !!sub.premium_underpad_bedroom ||
                    !!sub.premium_underpad_stairs ||
                    !!sub.stair_premium_carpet_selected;
                  const hasInterests =
                    sub.upgrade_interests &&
                    Object.values(sub.upgrade_interests).some((v) => v);

                  const missing: string[] = [];
                  if (hasUpgradeActivity && !sub.upgrade_comments?.trim()) {
                    missing.push('Upgrade Pricing Summary comments');
                  }
                  if (hasInterests && !sub.upgrade_interests_notes?.trim()) {
                    missing.push('Upgrade Interests notes');
                  }

                  if (missing.length === 0) return null;

                  return (
                    <div className="p-4 rounded-xl bg-warning/10 border border-warning/40">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground text-sm">
                            Possibly missing buyer comments
                          </p>
                          <p className="text-sm text-muted-foreground">
                            This submission has upgrade activity but the following
                            comment field{missing.length > 1 ? 's are' : ' is'} blank:
                          </p>
                          <ul className="list-disc list-inside text-sm text-foreground pl-1">
                            {missing.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                          <p className="text-xs text-muted-foreground pt-1">
                            These fields were added recently. Older submissions may
                            have comments that were never captured — confirm with the
                            buyer if needed.
                          </p>
                          <div className="pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={resyncCommentsFromDb}
                              disabled={resyncingComments}
                              className="gap-2"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${resyncingComments ? 'animate-spin' : ''}`} />
                              {resyncingComments ? 'Re-syncing…' : 'Re-sync comments from database'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Pricing Summary - FIRST (from quote lines) */}
                {(() => {
                  const grand = lineTotals.totalsOf(selectedSubmission.id);
                  const hasAnyUpgrades = grand.total > 0;
                  const sections = SECTION_ORDER
                    .map((section) => ({ section, t: lineTotals.sectionTotalsOf(selectedSubmission.id, section) }))
                    .filter(({ t }) => t.subtotal > 0);

                  return hasAnyUpgrades ? (
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-4">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <h4 className="font-semibold text-foreground">Upgrade Pricing Summary</h4>
                      </div>

                      <div className="space-y-3">
                        {sections.map(({ section, t }) => (
                          <div key={section} className="flex justify-between items-center py-2 border-b border-border/50">
                            <p className="font-medium text-sm">{SECTION_LABELS[section]}</p>
                            <span className="font-medium">${t.total.toFixed(2)}</span>
                          </div>
                        ))}

                        {/* Grand Total */}
                        <div className="flex justify-between items-center pt-3">
                          <div>
                            <p className="font-bold text-foreground">Grand Total</p>
                            <p className="text-xs text-muted-foreground">
                              Subtotal: ${grand.subtotal.toFixed(2)} + GST: ${grand.gst.toFixed(2)}
                            </p>
                          </div>
                          <span className="text-xl font-bold text-primary">${grand.total.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Payment Terms */}
                      <div className="mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Payment Terms:</p>
                        <p>• 50% deposit required upon contract signing (all major credit cards accepted)</p>
                        <p>• Balance due one month before expected possession date</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-muted/30 border border-border">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="w-5 h-5" />
                        <span className="text-sm">No paid upgrades selected — standard selections only</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Status Control and Download */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-xs text-muted-foreground">Update the submission status</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={generatingPdf}
                      onClick={async () => {
                        setGeneratingPdf(true);
                        console.log('Generating PDF for submission:', selectedSubmission.id);
                        try {
                          await generateSavedSubmissionPdf(selectedSubmission.id, true, true);
                          console.log('PDF generated successfully');
                          toast.success('PDF downloaded successfully');
                        } catch (error) {
                          console.error('PDF generation error:', error);
                          toast.error('Failed to generate PDF', {
                            description: error instanceof Error ? error.message : 'Unknown error',
                          });
                        } finally {
                          setGeneratingPdf(false);
                        }
                      }}
                    >
                      {generatingPdf ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      {generatingPdf ? 'Generating...' : 'Download PDF'}
                    </Button>
                    {(() => {
                      const s = selectedSubmission;
                      const hasCaptured =
                        !!s.lvp_comments ||
                        !!s.spc_tile_comments ||
                        !!s.window_comments ||
                        !!s.backsplash_grout_comments ||
                        !!(s as any).upgrade_comments ||
                        !!(s as any).upgrade_interests_notes ||
                        (s.area_upgrades || []).some(u => u.comments || u.clientComment);
                      if (!hasCaptured || !s.email) return null;
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resendingPdf}
                          onClick={resendCorrectedPdf}
                          title="Regenerate the buyer PDF (now including all captured comments) and email it to the buyer"
                        >
                          {resendingPdf ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4 mr-2" />
                          )}
                          {resendingPdf ? 'Sending...' : 'Resend Updated PDF'}
                        </Button>
                      );
                    })()}
                  </div>
                </div>

                {/* Buyer Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground">Buyer Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>
                      <span className="ml-2">{selectedSubmission.first_name} {selectedSubmission.last_name}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <span className="ml-2">{selectedSubmission.email}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="ml-2">{selectedSubmission.phone_number || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Possession:</span>
                      <span className="ml-2">
                        {selectedSubmission.estimated_possession_date 
                          ? format(new Date(selectedSubmission.estimated_possession_date), 'MMM d, yyyy')
                          : 'Not provided'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Flooring */}
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Flooring Selections</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Main Floor LVP:</span>
                      <span className="ml-2">{selectedSubmission.lvp_colour || 'Not selected'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Bathroom SPC:</span>
                      <span className="ml-2">{selectedSubmission.spc_tile_colour || 'Not selected'}</span>
                    </div>
                    {selectedSubmission.has_stairs && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Stair Flooring:</span>
                        {(selectedSubmission as any).stair_lvp_upgrade_selected ? (
                          <span className="ml-2">
                            <Badge className="bg-primary/10 text-primary border-primary/30">
                              LVP Upgrade with Custom Stair Nosings (${getStairLvpUpgradePrice().toLocaleString()} + GST)
                            </Badge>
                          </span>
                        ) : (
                          <span className="ml-2">
                            Standard Carpet{selectedSubmission.stair_carpet_colour 
                              ? ` — ${selectedSubmission.stair_carpet_colour}` 
                              : ' (color not selected)'}
                          </span>
                        )}
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Bedroom:</span>
                      <span className="ml-2 capitalize">
                        {selectedSubmission.bedroom_flooring_choice === 'lvp' 
                          ? `LVP (${selectedSubmission.bedroom_lvp_same_as_main ? 'Same as main' : selectedSubmission.bedroom_lvp_colour})`
                          : selectedSubmission.bedroom_flooring_choice || 'Not selected'}
                      </span>
                    </div>
                  </div>
                  {selectedSubmission.lvp_comments && (
                    <div className="p-3 rounded-lg bg-muted/50 text-sm">
                      <span className="text-muted-foreground">LVP Comments:</span> {selectedSubmission.lvp_comments}
                    </div>
                  )}
                </div>

                {/* Backsplash */}
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Kitchen Backsplash</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Orientation:</span>
                      <span className="ml-2 capitalize">{selectedSubmission.backsplash_orientation || 'Not selected'}</span>
                    </div>
                    {selectedSubmission.backsplash_grout_enabled && (
                      <div>
                        <span className="text-muted-foreground">Custom Grout Color:</span>
                        <span className="ml-2">{selectedSubmission.backsplash_grout_color || 'Not specified'}</span>
                      </div>
                    )}
                  </div>
                  {selectedSubmission.backsplash_grout_enabled && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                      <span className="font-medium text-warning">Custom Grout Color Change: ${getGroutColorChangePrice().toLocaleString()} + GST</span>
                      {selectedSubmission.backsplash_grout_comments && (
                        <p className="mt-1 text-muted-foreground">Comments: {selectedSubmission.backsplash_grout_comments}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Window Coverings */}
                {(selectedSubmission.additional_windows_qty > 0 || selectedSubmission.patio_doors_qty > 0) && (
                  <div className="space-y-2 p-4 rounded-lg bg-accent/10 border border-accent/30">
                    <h4 className="font-medium text-foreground">Window Covering Extensions</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Additional Windows:</span>
                        <span className="ml-2">{selectedSubmission.additional_windows_qty}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Patio Doors:</span>
                        <span className="ml-2">{selectedSubmission.patio_doors_qty}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total (before GST):</span>
                        <span className="ml-2 font-medium">${lineTotals.sectionTotalsOf(selectedSubmission.id, 'window_coverings').subtotal.toFixed(2)}</span>
                      </div>
                    </div>
                    {selectedSubmission.window_comments && (
                      <div className="p-3 rounded-lg bg-muted/50 text-sm mt-2">
                        <span className="text-muted-foreground">Comments:</span> {selectedSubmission.window_comments}
                      </div>
                    )}
                  </div>
                )}

                {/* Area Upgrades */}
                {selectedSubmission.area_upgrades && selectedSubmission.area_upgrades.length > 0 && (
                  <div className="space-y-2 p-4 rounded-lg bg-secondary/50 border border-border">
                    <h4 className="font-medium text-foreground flex items-center gap-2">
                      <span>🔧</span> Area Upgrades
                      {selectedSubmission.upgrade_floor_selection && (
                        <Badge variant="outline" className="ml-2">
                          Floor {selectedSubmission.upgrade_floor_selection}
                        </Badge>
                      )}
                    </h4>
                    <div className="space-y-3">
                      {selectedSubmission.area_upgrades.map((upgrade, index) => (
                        <div key={index} className="p-3 rounded-lg bg-background/50 border border-border text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-muted-foreground">Area:</span>
                              <span className="ml-2 font-medium">{AREA_NAMES[upgrade.areaId] || upgrade.areaId}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Material:</span>
                              <span className="ml-2">{MATERIAL_NAMES[upgrade.materialType] || upgrade.materialType}</span>
                            </div>
                            {upgrade.productName && (
                              <div>
                                <span className="text-muted-foreground">Product:</span>
                                <span className="ml-2">{upgrade.productName}</span>
                              </div>
                            )}
                            {upgrade.productColor && (
                              <div>
                                <span className="text-muted-foreground">Color:</span>
                                <span className="ml-2">{upgrade.productColor}</span>
                              </div>
                            )}
                          </div>
                          {upgrade.clientComment && (
                            <p className="mt-2 text-xs text-muted-foreground italic">Client note: {upgrade.clientComment}</p>
                          )}
                          {upgrade.comments && (
                            <p className="mt-2 text-xs text-muted-foreground italic">Internal note: {upgrade.comments}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Heated Floors & Other Options */}
                {(selectedSubmission.heated_floor_bathrooms && selectedSubmission.heated_floor_bathrooms > 0) && (
                  <div className="space-y-2 p-4 rounded-lg bg-warning/10 border border-warning/30">
                    <h4 className="font-medium text-foreground">Heated Floors</h4>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Bathrooms with Heated Floors:</span>
                      <span className="ml-2 font-medium">{selectedSubmission.heated_floor_bathrooms}</span>
                      <span className="ml-2 text-muted-foreground">($640 + GST per bathroom)</span>
                    </div>
                  </div>
                )}

                {/* Upgrade Interests */}
                {selectedSubmission.upgrade_interests && Object.values(selectedSubmission.upgrade_interests).some(v => v) && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-foreground">Upgrade Interests</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedSubmission.upgrade_interests)
                        .filter(([_, v]) => v)
                        .map(([key]) => (
                          <Badge key={key} variant="outline" className="capitalize">
                            {key.replace('-', ' ')}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                {/* Buyer Comments captured throughout the wizard */}
                {(selectedSubmission.spc_tile_comments || selectedSubmission.upgrade_interests_notes || selectedSubmission.upgrade_comments) && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-foreground">Buyer Comments</h4>
                    <div className="space-y-2">
                      {selectedSubmission.spc_tile_comments && (
                        <div className="p-3 rounded-lg bg-muted/50 text-sm">
                          <span className="text-muted-foreground">Bathroom Tile:</span> {selectedSubmission.spc_tile_comments}
                        </div>
                      )}
                      {selectedSubmission.upgrade_interests_notes && (
                        <div className="p-3 rounded-lg bg-muted/50 text-sm">
                          <span className="text-muted-foreground">Upgrade Interests Notes:</span> {selectedSubmission.upgrade_interests_notes}
                        </div>
                      )}
                      {selectedSubmission.upgrade_comments && (
                        <div className="p-3 rounded-lg bg-muted/50 text-sm">
                          <span className="text-muted-foreground">Upgrade Pricing Summary Comments:</span> {selectedSubmission.upgrade_comments}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Admin Notes */}
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Admin Notes & Comments</h4>
                  <div className="p-3 rounded-lg bg-muted/50 min-h-[80px] text-sm">
                    {selectedSubmission.sales_comments || (
                      <span className="text-muted-foreground italic">No notes added yet. Click Edit to add notes.</span>
                    )}
                  </div>
                </div>
              </div>
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {/* Deleting submissions is admin-only (buyer_selections DELETE RLS). */}
      {isAdmin && <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Submissions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.size} submission(s)? 
              This action cannot be undone. All associated data will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSelectedSubmissions}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}

      {/* Email Preview Dialog */}
      {selectedSubmission && (
        <EmailPreviewDialog
          open={emailPreviewOpen}
          onOpenChange={setEmailPreviewOpen}
          emailHtml={emailPreviewHtml}
          recipientEmail={selectedSubmission.email}
          subject={`Updated Selection Confirmation - Unit ${selectedSubmission.unit_number} | BMD Materials`}
          onSend={resendConfirmationEmail}
          sending={sendingEmail}
        />
      )}

      {/* PDF Preview Dialog — renders the EXACT PDF that gets emailed */}
      <Dialog open={pdfPreviewOpen} onOpenChange={(o) => {
        setPdfPreviewOpen(o);
        if (!o && pdfPreviewUrl) {
          URL.revokeObjectURL(pdfPreviewUrl);
          setPdfPreviewUrl('');
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Buyer PDF Preview
              {selectedSubmission && (
                <span className="text-sm font-normal text-muted-foreground">
                  · Unit {selectedSubmission.unit_number} · {selectedSubmission.first_name} {selectedSubmission.last_name}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              This is the same PDF that gets attached to the buyer email — generated from the shared pricing engine.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-lg bg-muted/20 overflow-hidden">
            {pdfPreviewLoading || !pdfPreviewUrl ? (
              <div className="w-full h-[70vh] flex items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Rendering PDF…
              </div>
            ) : (
              <iframe
                src={pdfPreviewUrl}
                title="Buyer PDF Preview"
                className="w-full h-[70vh]"
              />
            )}
          </div>
          <div className="flex justify-between gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setPdfPreviewOpen(false)}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
            {pdfPreviewUrl && (
              <a
                href={pdfPreviewUrl}
                download={selectedSubmission ? `Unit-${selectedSubmission.unit_number}-Selection-Preview.pdf` : 'preview.pdf'}
              >
                <Button>
                  <Download className="w-4 h-4 mr-1" /> Download
                </Button>
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
