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
import { Search, Eye, RefreshCw, Home, Download, Pencil, Save, X, DollarSign } from 'lucide-react';
import { generateSubmissionPDF } from '@/lib/submissionPdfGenerator';
import { format } from 'date-fns';
import { 
  calculateAreaUpgradePrice, 
  calculateBacksplashGroutPrice,
  normalizeUnitTypeCode,
  UNIT_AREA_DATA,
  UpgradeArea
} from '@/lib/upgradeCostData';

// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
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
  carpet: 'Premium Carpet',
  tile: 'Premium Tile',
};

// Pricing constants
const PATIO_DOOR_PRICE = 2347.80;
const ADDITIONAL_WINDOW_PRICE = 673.50;
const HEATED_FLOOR_PRICE = 1650;
const PORCELAIN_TILE_PER_ENSUITE = 1571;
const BACKSPLASH_GROUT_PRICE = 300;
const GST_RATE = 0.05;

// Calculate all pricing for a submission
function calculateSubmissionPricing(submission: BuyerSelection): {
  windowCoverings: { subtotal: number; gst: number; total: number };
  flooringUpgrades: { subtotal: number; gst: number; total: number };
  tileUpgrades: { subtotal: number; gst: number; total: number };
  heatedFloors: { subtotal: number; gst: number; total: number };
  backsplashGrout: { subtotal: number; gst: number; total: number };
  grandTotal: { subtotal: number; gst: number; total: number };
} {
  // Window Coverings
  const patioTotal = (submission.patio_doors_qty || 0) * PATIO_DOOR_PRICE;
  const windowTotal = (submission.additional_windows_qty || 0) * ADDITIONAL_WINDOW_PRICE;
  const windowSubtotal = patioTotal + windowTotal;
  const windowGst = windowSubtotal * GST_RATE;
  
  // Flooring Upgrades (LVP, Hardwood, Carpet)
  let flooringSubtotal = 0;
  if (submission.area_upgrades && submission.area_upgrades.length > 0) {
    const unitTypeCode = extractUnitTypeCode(submission.unit_type, submission.upgrade_floor_selection);
    for (const upgrade of submission.area_upgrades) {
      if (['lvp', 'hardwood', 'carpet'].includes(upgrade.materialType)) {
        const pricing = calculateAreaUpgradePrice(
          unitTypeCode, 
          upgrade.areaId as UpgradeArea, 
          upgrade.materialType as 'lvp' | 'hardwood' | 'carpet' | 'tile'
        );
        flooringSubtotal += pricing.markedUpCost;
      }
    }
  }
  const flooringGst = flooringSubtotal * GST_RATE;
  
  // Tile Upgrades (bathroom tile, backsplash tile)
  let tileSubtotal = 0;
  if (submission.bathroom_tile_selected) {
    // Porcelain tile upgrade per bathroom
    const bathrooms = submission.heated_floor_bathrooms || 1;
    tileSubtotal += bathrooms * PORCELAIN_TILE_PER_ENSUITE;
  }
  if (submission.area_upgrades && submission.area_upgrades.length > 0) {
    const unitTypeCode = extractUnitTypeCode(submission.unit_type, submission.upgrade_floor_selection);
    for (const upgrade of submission.area_upgrades) {
      if (upgrade.materialType === 'tile') {
        const pricing = calculateAreaUpgradePrice(
          unitTypeCode, 
          upgrade.areaId as UpgradeArea, 
          'tile'
        );
        tileSubtotal += pricing.markedUpCost;
      }
    }
  }
  const tileGst = tileSubtotal * GST_RATE;
  
  // Heated Floors
  const heatedSubtotal = (submission.heated_floor_bathrooms || 0) * HEATED_FLOOR_PRICE;
  const heatedGst = heatedSubtotal * GST_RATE;
  
  // Backsplash Grout Color Change
  const groutSubtotal = submission.backsplash_grout_enabled ? BACKSPLASH_GROUT_PRICE : 0;
  const groutGst = groutSubtotal * GST_RATE;
  
  // Grand Total
  const grandSubtotal = windowSubtotal + flooringSubtotal + tileSubtotal + heatedSubtotal + groutSubtotal;
  const grandGst = grandSubtotal * GST_RATE;
  const grandTotal = grandSubtotal + grandGst;
  
  return {
    windowCoverings: { subtotal: windowSubtotal, gst: windowGst, total: windowSubtotal + windowGst },
    flooringUpgrades: { subtotal: flooringSubtotal, gst: flooringGst, total: flooringSubtotal + flooringGst },
    tileUpgrades: { subtotal: tileSubtotal, gst: tileGst, total: tileSubtotal + tileGst },
    heatedFloors: { subtotal: heatedSubtotal, gst: heatedGst, total: heatedSubtotal + heatedGst },
    backsplashGrout: { subtotal: groutSubtotal, gst: groutGst, total: groutSubtotal + groutGst },
    grandTotal: { subtotal: grandSubtotal, gst: grandGst, total: grandTotal },
  };
}

// Extract unit type code from unit_type string
function extractUnitTypeCode(unitType: string | null, floorSelection?: string | null): string {
  if (!unitType) return 'J'; // Default
  const match = unitType.match(/[A-J]/i);
  if (!match) return 'J';
  const code = match[0].toUpperCase();
  if ((code === 'G' || code === 'H') && floorSelection) {
    return `${code}-${floorSelection}`;
  }
  return code;
}

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
                {/* Pricing Summary - FIRST */}
                {(() => {
                  const pricing = calculateSubmissionPricing(selectedSubmission);
                  const hasAnyUpgrades = pricing.grandTotal.total > 0;
                  
                  return hasAnyUpgrades ? (
                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-4">
                        <DollarSign className="w-5 h-5 text-primary" />
                        <h4 className="font-semibold text-foreground">Upgrade Pricing Summary</h4>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Window Coverings */}
                        {pricing.windowCoverings.subtotal > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-border/50">
                            <div>
                              <p className="font-medium text-sm">Window Coverings</p>
                              <p className="text-xs text-muted-foreground">
                                {selectedSubmission.patio_doors_qty > 0 && `${selectedSubmission.patio_doors_qty} Patio Door(s)`}
                                {selectedSubmission.patio_doors_qty > 0 && selectedSubmission.additional_windows_qty > 0 && ' + '}
                                {selectedSubmission.additional_windows_qty > 0 && `${selectedSubmission.additional_windows_qty} Window(s)`}
                              </p>
                            </div>
                            <span className="font-medium">${pricing.windowCoverings.total.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Flooring Upgrades */}
                        {pricing.flooringUpgrades.subtotal > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-border/50">
                            <div>
                              <p className="font-medium text-sm">Flooring Upgrades</p>
                              <p className="text-xs text-muted-foreground">LVP, Hardwood, Carpet</p>
                            </div>
                            <span className="font-medium">${pricing.flooringUpgrades.total.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Tile Upgrades */}
                        {pricing.tileUpgrades.subtotal > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-border/50">
                            <div>
                              <p className="font-medium text-sm">Tile Upgrades</p>
                              <p className="text-xs text-muted-foreground">Porcelain tile, backsplash</p>
                            </div>
                            <span className="font-medium">${pricing.tileUpgrades.total.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Heated Floors */}
                        {pricing.heatedFloors.subtotal > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-border/50">
                            <div>
                              <p className="font-medium text-sm">Heated Floors</p>
                              <p className="text-xs text-muted-foreground">{selectedSubmission.heated_floor_bathrooms} bathroom(s)</p>
                            </div>
                            <span className="font-medium">${pricing.heatedFloors.total.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Backsplash Grout */}
                        {pricing.backsplashGrout.subtotal > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-border/50">
                            <div>
                              <p className="font-medium text-sm">Custom Grout Color</p>
                              <p className="text-xs text-muted-foreground">{selectedSubmission.backsplash_grout_color}</p>
                            </div>
                            <span className="font-medium">${pricing.backsplashGrout.total.toFixed(2)}</span>
                          </div>
                        )}
                        
                        {/* Grand Total */}
                        <div className="flex justify-between items-center pt-3">
                          <div>
                            <p className="font-bold text-foreground">Grand Total</p>
                            <p className="text-xs text-muted-foreground">
                              Subtotal: ${pricing.grandTotal.subtotal.toFixed(2)} + GST: ${pricing.grandTotal.gst.toFixed(2)}
                            </p>
                          </div>
                          <span className="text-xl font-bold text-primary">${pricing.grandTotal.total.toFixed(2)}</span>
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
                      onClick={async () => {
                        try {
                          await generateSubmissionPDF(selectedSubmission);
                          toast.success('PDF downloaded successfully');
                        } catch (error) {
                          console.error('PDF generation error:', error);
                          toast.error('Failed to generate PDF');
                        }
                      }}
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
                    <div className="p-3 rounded-lg bg-amber-100/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
                      <span className="font-medium text-amber-800 dark:text-amber-300">Custom Grout Color Change: $300 + GST</span>
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
                        <span className="text-muted-foreground">Total:</span>
                        <span className="ml-2 font-medium">${selectedSubmission.window_total?.toFixed(2)}</span>
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
                  <div className="space-y-2 p-4 rounded-lg bg-purple-100/50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
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
                          {upgrade.comments && (
                            <p className="mt-2 text-xs text-muted-foreground italic">Comments: {upgrade.comments}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Heated Floors & Other Options */}
                {(selectedSubmission.heated_floor_bathrooms && selectedSubmission.heated_floor_bathrooms > 0) && (
                  <div className="space-y-2 p-4 rounded-lg bg-orange-100/50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                    <h4 className="font-medium text-foreground">Heated Floors</h4>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Bathrooms with Heated Floors:</span>
                      <span className="ml-2 font-medium">{selectedSubmission.heated_floor_bathrooms}</span>
                      <span className="ml-2 text-muted-foreground">($1,650 + GST per bathroom)</span>
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
