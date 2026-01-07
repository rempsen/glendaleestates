import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import { Search, Eye, RefreshCw, Home, Download, Pencil, Save, X } from 'lucide-react';
import { generateSubmissionPDF } from '@/lib/submissionPdfGenerator';
import { format } from 'date-fns';

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
  window_total: number;
  window_comments?: string | null;
  upgrade_interests: Record<string, boolean>;
  status: string;
  sales_comments: string | null;
}

const statusColors: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  reviewed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<BuyerSelection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<BuyerSelection>>({});
  const [saving, setSaving] = useState(false);

  const fetchSubmissions = async () => {
    setLoading(true);
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

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('buyer_selections')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setSubmissions(prev => 
        prev.map(s => s.id === id ? { ...s, status: newStatus } : s)
      );
      
      if (selectedSubmission?.id === id) {
        setSelectedSubmission(prev => prev ? { ...prev, status: newStatus } : null);
      }

      toast.success('Status updated');
    } catch (error: any) {
      toast.error('Failed to update status', {
        description: error.message,
      });
    }
  };

  const filteredSubmissions = submissions.filter(s => {
    const matchesSearch = 
      s.unit_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const openDetails = (submission: BuyerSelection) => {
    setSelectedSubmission(submission);
    setEditData({
      first_name: submission.first_name,
      last_name: submission.last_name,
      email: submission.email,
      phone_number: submission.phone_number,
      unit_number: submission.unit_number,
      unit_type: submission.unit_type,
      sales_comments: submission.sales_comments,
    });
    setEditMode(false);
    setDetailsOpen(true);
  };

  const handleEditChange = (field: keyof BuyerSelection, value: string | null) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const saveChanges = async () => {
    if (!selectedSubmission) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('buyer_selections')
        .update({
          first_name: editData.first_name,
          last_name: editData.last_name,
          email: editData.email,
          phone_number: editData.phone_number,
          unit_number: editData.unit_number,
          unit_type: editData.unit_type,
          sales_comments: editData.sales_comments,
        })
        .eq('id', selectedSubmission.id);

      if (error) throw error;

      // Update local state
      const updatedSubmission = { ...selectedSubmission, ...editData };
      setSubmissions(prev => 
        prev.map(s => s.id === selectedSubmission.id ? updatedSubmission as BuyerSelection : s)
      );
      setSelectedSubmission(updatedSubmission as BuyerSelection);
      setEditMode(false);
      toast.success('Changes saved successfully');
    } catch (error: any) {
      toast.error('Failed to save changes', {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (selectedSubmission) {
      setEditData({
        first_name: selectedSubmission.first_name,
        last_name: selectedSubmission.last_name,
        email: selectedSubmission.email,
        phone_number: selectedSubmission.phone_number,
        unit_number: selectedSubmission.unit_number,
        unit_type: selectedSubmission.unit_type,
        sales_comments: selectedSubmission.sales_comments,
      });
    }
    setEditMode(false);
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
            </p>
          </div>
          <Button variant="outline" onClick={fetchSubmissions} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading submissions...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No submissions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
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
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedSubmission && (
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
                    {editMode ? (
                      <>
                        <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                        <Button size="sm" onClick={saveChanges} disabled={saving}>
                          <Save className="w-4 h-4 mr-1" />
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                <DialogDescription>
                  Submitted {format(new Date(selectedSubmission.created_at), 'MMMM d, yyyy at h:mm a')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 mt-4">
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
                      onClick={() => generateSubmissionPDF(selectedSubmission)}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Button>
                    <Select 
                      value={selectedSubmission.status} 
                      onValueChange={(value) => updateStatus(selectedSubmission.id, value)}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="reviewed">Reviewed</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Buyer Info */}
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground">Buyer Information</h4>
                  {editMode ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first_name">First Name</Label>
                        <Input
                          id="first_name"
                          value={editData.first_name || ''}
                          onChange={(e) => handleEditChange('first_name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last_name">Last Name</Label>
                        <Input
                          id="last_name"
                          value={editData.last_name || ''}
                          onChange={(e) => handleEditChange('last_name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={editData.email || ''}
                          onChange={(e) => handleEditChange('email', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={editData.phone_number || ''}
                          onChange={(e) => handleEditChange('phone_number', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unit_number">Unit Number</Label>
                        <Input
                          id="unit_number"
                          value={editData.unit_number || ''}
                          onChange={(e) => handleEditChange('unit_number', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unit_type">Unit Type</Label>
                        <Input
                          id="unit_type"
                          value={editData.unit_type || ''}
                          onChange={(e) => handleEditChange('unit_type', e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
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
                  )}
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
                      <div>
                        <span className="text-muted-foreground">Stairs Carpet:</span>
                        <span className="ml-2">{selectedSubmission.stair_carpet_colour || 'Not selected'}</span>
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
                  <p className="text-sm capitalize">{selectedSubmission.backsplash_orientation || 'Not selected'}</p>
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
                        <span className="text-muted-foreground">Total:</span>
                        <span className="ml-2 font-medium">${selectedSubmission.window_total?.toFixed(2)}</span>
                      </div>
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

                {/* Admin Notes */}
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground">Admin Notes & Comments</h4>
                  {editMode ? (
                    <Textarea
                      placeholder="Add internal notes about this client..."
                      value={editData.sales_comments || ''}
                      onChange={(e) => handleEditChange('sales_comments', e.target.value)}
                      rows={4}
                      className="resize-none"
                    />
                  ) : (
                    <div className="p-3 rounded-lg bg-muted/50 min-h-[80px] text-sm">
                      {selectedSubmission.sales_comments || (
                        <span className="text-muted-foreground italic">No notes added yet. Click Edit to add notes.</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
