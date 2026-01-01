import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { homes, SelectionStatus, getStatusLabel } from '@/lib/mockData';
import { Search, Download, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { flooringOptions, backsplashOrientations } from '@/lib/mockData';

export default function AdminHomes() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SelectionStatus | 'all'>('all');
  const [selectedHome, setSelectedHome] = useState<typeof homes[0] | null>(null);

  const filteredHomes = useMemo(() => {
    return homes.filter((home) => {
      const matchesSearch = 
        home.lot.toLowerCase().includes(search.toLowerCase()) ||
        home.address.toLowerCase().includes(search.toLowerCase()) ||
        home.buyerName.toLowerCase().includes(search.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || home.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  const handleExport = () => {
    const csv = [
      ['Lot', 'Address', 'Buyer Name', 'Status', 'Flooring Complete', 'Window Extensions', 'Upgrade Value', 'Last Activity'].join(','),
      ...filteredHomes.map(h => [
        h.lot,
        h.address,
        h.buyerName,
        getStatusLabel(h.status),
        h.flooringCompleted ? 'Yes' : 'No',
        h.windowExtensions ? 'Yes' : 'No',
        h.estimatedUpgradeValue,
        h.lastActivityDate
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'glendale-homes-export.csv';
    a.click();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              All Homes
            </h1>
            <p className="text-muted-foreground mt-1">
              {filteredHomes.length} of {homes.length} homes
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Export to CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by lot, address, or buyer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SelectionStatus | 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">Lot / Address</th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">Buyer</th>
                  <th className="text-left py-4 px-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Flooring</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Windows</th>
                  <th className="text-right py-4 px-4 text-sm font-medium text-muted-foreground">Upgrade Value</th>
                  <th className="text-right py-4 px-4 text-sm font-medium text-muted-foreground">Last Activity</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHomes.map((home) => (
                  <tr key={home.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-medium text-foreground">{home.lot}</p>
                        <p className="text-sm text-muted-foreground">{home.address}</p>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-foreground">{home.buyerName}</p>
                      <p className="text-xs text-muted-foreground">{home.buyerEmail}</p>
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={home.status} />
                    </td>
                    <td className="py-4 px-4 text-center">
                      {home.flooringCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                      ) : (
                        <XCircle className="w-5 h-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {home.windowExtensions ? (
                        <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                      ) : (
                        <XCircle className="w-5 h-5 text-muted-foreground mx-auto" />
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {home.estimatedUpgradeValue > 0 ? (
                        <span className="font-medium text-foreground">
                          ${home.estimatedUpgradeValue.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right text-sm text-muted-foreground">
                      {home.lastActivityDate}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setSelectedHome(home)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Home Detail Dialog */}
        <Dialog open={!!selectedHome} onOpenChange={() => setSelectedHome(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedHome && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl">
                    {selectedHome.lot} — {selectedHome.address}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-6 py-4">
                  {/* Buyer Info */}
                  <div className="p-4 rounded-lg bg-secondary/30">
                    <h4 className="font-medium text-foreground mb-2">Buyer Information</h4>
                    <p className="text-sm text-muted-foreground">{selectedHome.buyerName}</p>
                    <p className="text-sm text-muted-foreground">{selectedHome.buyerEmail}</p>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <StatusBadge status={selectedHome.status} />
                  </div>

                  {/* Selections */}
                  {selectedHome.selections && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Selections</h4>
                      
                      <div className="grid gap-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Main Floor LVP</span>
                          <span className="font-medium">
                            {flooringOptions.mainFloorLVP.find(o => o.id === selectedHome.selections?.mainFloorLVP)?.name || 'Not selected'}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Washroom SPC</span>
                          <span className="font-medium">
                            {flooringOptions.washroomSPC.find(o => o.id === selectedHome.selections?.washroomSPC)?.name || 'Not selected'}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Backsplash</span>
                          <span className="font-medium capitalize">
                            {selectedHome.selections.backsplashOrientation || 'Not selected'}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Stairs Carpet</span>
                          <span className="font-medium">
                            {flooringOptions.carpetColors.find(o => o.id === selectedHome.selections?.stairsCarpet)?.name || 'Not selected'}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Additional Windows</span>
                          <span className="font-medium">{selectedHome.selections.additionalWindows}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Patio Doors</span>
                          <span className="font-medium">{selectedHome.selections.patioDoors}</span>
                        </div>
                      </div>

                      {/* Upgrade Interests */}
                      {selectedHome.selections.upgradeInterests.length > 0 && (
                        <div className="p-4 rounded-lg bg-accent/10 border border-accent/30">
                          <h4 className="font-medium text-foreground mb-2">Interested in Upgrades</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedHome.selections.upgradeInterests.map(interest => (
                              <span 
                                key={interest}
                                className="px-2 py-1 text-xs rounded-full bg-accent/20 text-accent capitalize"
                              >
                                {interest.replace(/-/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Estimated Value */}
                  {selectedHome.estimatedUpgradeValue > 0 && (
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                      <h4 className="font-medium text-foreground mb-1">Estimated Upgrade Value</h4>
                      <p className="text-2xl font-serif font-semibold text-primary">
                        ${selectedHome.estimatedUpgradeValue.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
