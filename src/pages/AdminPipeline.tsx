import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatCard } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { unitData } from '@/lib/unitData';
import { toast } from 'sonner';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  FileCheck, 
  RefreshCw, 
  Plus, 
  Edit2, 
  Search,
  Building,
  TrendingUp,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface PipelineRecord {
  id: string;
  unit_number: string;
  unit_type: string | null;
  buyer_first_name: string | null;
  buyer_last_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  pipeline_stage: string;
  lead_date: string | null;
  meeting_date: string | null;
  quoted_date: string | null;
  signed_date: string | null;
  contract_signed: boolean;
  deposit_received: boolean;
  deposit_amount: number | null;
  deposit_date: string | null;
  contract_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  notes: string | null;
  hubspot_contact_id: string | null;
  documents_sent: boolean;
  documents_signed: boolean;
  created_at: string;
  updated_at: string;
}

const PIPELINE_STAGES = [
  { value: 'lead', label: 'Lead', color: 'bg-muted text-muted-foreground' },
  { value: 'meeting', label: 'Meeting', color: 'bg-info/20 text-info' },
  { value: 'quoted', label: 'Quoted', color: 'bg-warning/20 text-warning' },
  { value: 'signed', label: 'Signed', color: 'bg-success/20 text-success' },
];

const TOTAL_UNITS = 70;

export default function AdminPipeline() {
  const [records, setRecords] = useState<PipelineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [editingRecord, setEditingRecord] = useState<PipelineRecord | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sales_pipeline')
      .select('*')
      .order('unit_number', { ascending: true });

    if (error) {
      toast.error('Failed to load pipeline data');
      console.error(error);
    } else {
      setRecords((data || []) as PipelineRecord[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const initializeUnit = async (unitNumber: string) => {
    const unitInfo = unitData[parseInt(unitNumber)];
    const { error } = await supabase.from('sales_pipeline').insert({
      unit_number: unitNumber,
      unit_type: unitInfo?.unitType || null,
      pipeline_stage: 'lead',
      lead_date: new Date().toISOString(),
    });

    if (error) {
      if (error.code === '23505') {
        toast.error('Unit already exists in pipeline');
      } else {
        toast.error('Failed to add unit');
      }
    } else {
      toast.success(`Unit ${unitNumber} added to pipeline`);
      fetchRecords();
    }
  };

  const updateRecord = async (record: PipelineRecord) => {
    // Calculate total if contract amount exists
    const contractAmount = record.contract_amount || 0;
    const taxAmount = contractAmount * 0.05; // 5% GST
    const totalAmount = contractAmount + taxAmount;

    const { error } = await supabase
      .from('sales_pipeline')
      .update({
        ...record,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (error) {
      toast.error('Failed to update record');
    } else {
      toast.success('Record updated');
      setIsDialogOpen(false);
      setEditingRecord(null);
      fetchRecords();
    }
  };

  const updateStage = async (record: PipelineRecord, newStage: string) => {
    const stageUpdates: Partial<PipelineRecord> = { pipeline_stage: newStage };
    const now = new Date().toISOString();

    if (newStage === 'lead' && !record.lead_date) stageUpdates.lead_date = now;
    if (newStage === 'meeting' && !record.meeting_date) stageUpdates.meeting_date = now;
    if (newStage === 'quoted' && !record.quoted_date) stageUpdates.quoted_date = now;
    if (newStage === 'signed' && !record.signed_date) {
      stageUpdates.signed_date = now;
      stageUpdates.contract_signed = true;
    }

    const { error } = await supabase
      .from('sales_pipeline')
      .update(stageUpdates)
      .eq('id', record.id);

    if (error) {
      toast.error('Failed to update stage');
    } else {
      toast.success(`Moved to ${newStage}`);
      fetchRecords();
    }
  };

  // Calculate statistics
  const stats = {
    totalTracked: records.length,
    untrackedUnits: TOTAL_UNITS - records.length,
    byStage: {
      lead: records.filter(r => r.pipeline_stage === 'lead').length,
      meeting: records.filter(r => r.pipeline_stage === 'meeting').length,
      quoted: records.filter(r => r.pipeline_stage === 'quoted').length,
      signed: records.filter(r => r.pipeline_stage === 'signed').length,
    },
    contractsSigned: records.filter(r => r.contract_signed).length,
    depositsReceived: records.filter(r => r.deposit_received).length,
    totalContractValue: records.reduce((sum, r) => sum + (r.contract_amount || 0), 0),
    totalTax: records.reduce((sum, r) => sum + (r.tax_amount || 0), 0),
    totalRevenue: records.reduce((sum, r) => sum + (r.total_amount || 0), 0),
    avgContractValue: records.filter(r => r.contract_amount).length > 0 
      ? records.reduce((sum, r) => sum + (r.contract_amount || 0), 0) / records.filter(r => r.contract_amount).length 
      : 0,
  };

  // Filter records
  const filteredRecords = records.filter(r => {
    const matchesSearch = searchTerm === '' || 
      r.unit_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${r.buyer_first_name} ${r.buyer_last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.buyer_email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStage = stageFilter === 'all' || r.pipeline_stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  // Get untracked units
  const trackedUnitNumbers = new Set(records.map(r => r.unit_number));
  const untrackedUnits = Object.keys(unitData).filter(u => !trackedUnitNumbers.has(u));

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Sales Pipeline</h1>
            <p className="text-muted-foreground mt-1">Tracking {stats.totalTracked} of {TOTAL_UNITS} units</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRecords} className="gap-2">
              <RefreshCw className="w-4 h-4" />Refresh
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            title="Units Engaged" 
            value={stats.totalTracked} 
            subtitle={`${stats.untrackedUnits} not yet contacted`} 
            icon={<Building className="w-5 h-5 text-primary" />} 
          />
          <StatCard 
            title="Contracts Signed" 
            value={stats.contractsSigned} 
            subtitle={`${stats.depositsReceived} deposits received`} 
            icon={<FileCheck className="w-5 h-5 text-success" />} 
          />
          <StatCard 
            title="Total Revenue" 
            value={`$${stats.totalRevenue.toLocaleString()}`} 
            subtitle={`$${stats.totalTax.toLocaleString()} in GST`} 
            icon={<DollarSign className="w-5 h-5 text-primary" />} 
          />
          <StatCard 
            title="Avg Contract" 
            value={`$${Math.round(stats.avgContractValue).toLocaleString()}`} 
            subtitle="Per signed unit" 
            icon={<TrendingUp className="w-5 h-5 text-accent" />} 
          />
        </div>

        {/* Pipeline Funnel */}
        <div className="grid gap-4 sm:grid-cols-4">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage.value} className="p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className={stage.color}>{stage.label}</Badge>
                <span className="text-2xl font-serif font-semibold">{stats.byStage[stage.value as keyof typeof stats.byStage]}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all" 
                  style={{ width: `${(stats.byStage[stage.value as keyof typeof stats.byStage] / TOTAL_UNITS) * 100}%` }}
                />
              </div>
            </div>
          ))}
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
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {PIPELINE_STAGES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add Untracked Unit */}
        {untrackedUnits.length > 0 && (
          <div className="p-4 rounded-xl border border-dashed border-border bg-muted/30">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Add Unit to Pipeline</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {untrackedUnits.slice(0, 20).map(unit => (
                <Button 
                  key={unit} 
                  variant="outline" 
                  size="sm" 
                  onClick={() => initializeUnit(unit)}
                  className="h-8"
                >
                  Unit {unit}
                </Button>
              ))}
              {untrackedUnits.length > 20 && (
                <span className="text-sm text-muted-foreground self-center">+{untrackedUnits.length - 20} more</span>
              )}
            </div>
          </div>
        )}

        {/* Pipeline Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Unit</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Stage</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Contract</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const stageInfo = PIPELINE_STAGES.find(s => s.value === record.pipeline_stage);
                  return (
                    <tr key={record.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-3 px-4">
                        <p className="font-medium text-foreground">Unit {record.unit_number}</p>
                        <p className="text-xs text-muted-foreground">{record.unit_type || 'N/A'}</p>
                      </td>
                      <td className="py-3 px-4">
                        {record.buyer_first_name ? (
                          <>
                            <p className="text-sm text-foreground">{record.buyer_first_name} {record.buyer_last_name}</p>
                            <p className="text-xs text-muted-foreground">{record.buyer_email}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Select 
                          value={record.pipeline_stage} 
                          onValueChange={(v) => updateStage(record, v)}
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <Badge variant="outline" className={stageInfo?.color}>{stageInfo?.label}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-4">
                        {record.contract_amount ? (
                          <>
                            <p className="text-sm font-medium text-foreground">${record.contract_amount.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">+${record.tax_amount?.toLocaleString()} GST</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {record.contract_signed && (
                            <Badge variant="outline" className="bg-success/20 text-success text-xs">Signed</Badge>
                          )}
                          {record.deposit_received && (
                            <Badge variant="outline" className="bg-primary/20 text-primary text-xs">Deposit</Badge>
                          )}
                          {record.documents_sent && (
                            <Badge variant="outline" className="bg-info/20 text-info text-xs">Docs Sent</Badge>
                          )}
                          {record.documents_signed && (
                            <Badge variant="outline" className="bg-success/20 text-success text-xs">Docs Signed</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Dialog open={isDialogOpen && editingRecord?.id === record.id} onOpenChange={(open) => {
                          setIsDialogOpen(open);
                          if (!open) setEditingRecord(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setEditingRecord(record);
                                setIsDialogOpen(true);
                              }}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit Unit {record.unit_number}</DialogTitle>
                            </DialogHeader>
                            {editingRecord && (
                              <div className="space-y-4 pt-4">
                                {/* Buyer Info */}
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>First Name</Label>
                                    <Input 
                                      value={editingRecord.buyer_first_name || ''} 
                                      onChange={(e) => setEditingRecord({...editingRecord, buyer_first_name: e.target.value})}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Last Name</Label>
                                    <Input 
                                      value={editingRecord.buyer_last_name || ''} 
                                      onChange={(e) => setEditingRecord({...editingRecord, buyer_last_name: e.target.value})}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input 
                                      type="email"
                                      value={editingRecord.buyer_email || ''} 
                                      onChange={(e) => setEditingRecord({...editingRecord, buyer_email: e.target.value})}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input 
                                      value={editingRecord.buyer_phone || ''} 
                                      onChange={(e) => setEditingRecord({...editingRecord, buyer_phone: e.target.value})}
                                    />
                                  </div>
                                </div>

                                {/* Financial Info */}
                                <div className="border-t border-border pt-4">
                                  <h4 className="font-medium mb-3">Financial Details</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <Label>Contract Amount ($)</Label>
                                      <Input 
                                        type="number"
                                        value={editingRecord.contract_amount || ''} 
                                        onChange={(e) => setEditingRecord({...editingRecord, contract_amount: parseFloat(e.target.value) || null})}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Deposit Amount ($)</Label>
                                      <Input 
                                        type="number"
                                        value={editingRecord.deposit_amount || ''} 
                                        onChange={(e) => setEditingRecord({...editingRecord, deposit_amount: parseFloat(e.target.value) || null})}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Status Toggles */}
                                <div className="border-t border-border pt-4">
                                  <h4 className="font-medium mb-3">Status</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={editingRecord.contract_signed}
                                        onChange={(e) => setEditingRecord({...editingRecord, contract_signed: e.target.checked})}
                                        className="rounded border-input"
                                      />
                                      <span className="text-sm">Contract Signed</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={editingRecord.deposit_received}
                                        onChange={(e) => setEditingRecord({...editingRecord, deposit_received: e.target.checked})}
                                        className="rounded border-input"
                                      />
                                      <span className="text-sm">Deposit Received</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={editingRecord.documents_sent}
                                        onChange={(e) => setEditingRecord({...editingRecord, documents_sent: e.target.checked})}
                                        className="rounded border-input"
                                      />
                                      <span className="text-sm">Documents Sent</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input 
                                        type="checkbox" 
                                        checked={editingRecord.documents_signed}
                                        onChange={(e) => setEditingRecord({...editingRecord, documents_signed: e.target.checked})}
                                        className="rounded border-input"
                                      />
                                      <span className="text-sm">Documents Signed</span>
                                    </label>
                                  </div>
                                </div>

                                {/* Notes */}
                                <div className="space-y-2">
                                  <Label>Notes</Label>
                                  <Textarea 
                                    value={editingRecord.notes || ''} 
                                    onChange={(e) => setEditingRecord({...editingRecord, notes: e.target.value})}
                                    rows={3}
                                  />
                                </div>

                                <div className="flex justify-end gap-2 pt-4">
                                  <Button variant="outline" onClick={() => {
                                    setIsDialogOpen(false);
                                    setEditingRecord(null);
                                  }}>Cancel</Button>
                                  <Button onClick={() => updateRecord(editingRecord)}>Save Changes</Button>
                                </div>
                              </div>
                            )}
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredRecords.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              {records.length === 0 ? 'No units in pipeline. Add units above to start tracking.' : 'No matching records found.'}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
