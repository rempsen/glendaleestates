import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { homes, SelectionStatus, getStatusLabel, lvpOptions, spcTileOptions, carpetOptions } from '@/lib/mockData';
import { generateBuyerSelectionPDF } from '@/lib/pdfGenerator';
import { Search, Download, CheckCircle2, XCircle, Eye, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from 'sonner';

export default function AdminHomes() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SelectionStatus | 'all'>('all');
  const [selectedHome, setSelectedHome] = useState<typeof homes[0] | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  const filteredHomes = useMemo(() => {
    return homes.filter((home) => {
      const matchesSearch = home.lot.toLowerCase().includes(search.toLowerCase()) || home.address.toLowerCase().includes(search.toLowerCase()) || home.buyerName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || home.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  const handleExportCSV = () => {
    const csv = [
      ['Lot', 'Address', 'Buyer Name', 'Status', 'LVP Colour', 'SPC Tile', 'Additional Windows', 'Patio Doors', 'Window Total'].join(','),
      ...filteredHomes.map(h => [h.lot, h.address, h.buyerName, getStatusLabel(h.status), h.selections?.lvpColour || '', h.selections?.spcTileColour || '', h.selections?.additionalWindowsQty || 0, h.selections?.patioDoorsQty || 0, h.windowExtensionTotal].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'glendale-homes-export.csv'; a.click();
  };

  const handleGeneratePDF = async (home: typeof homes[0]) => {
    setGeneratingPDF(home.id);
    try {
      await generateBuyerSelectionPDF(home);
      toast.success('PDF generated successfully', { description: `${home.lot} selection summary downloaded.` });
    } catch (error) {
      toast.error('Failed to generate PDF');
      console.error(error);
    } finally {
      setGeneratingPDF(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">All Homes</h1>
            <p className="text-muted-foreground mt-1">{filteredHomes.length} of {homes.length} homes</p>
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
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SelectionStatus | 'all')}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter by status" /></SelectTrigger>
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
                  <th className="text-right py-4 px-4 text-sm font-medium text-muted-foreground">Total</th>
                  <th className="text-center py-4 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHomes.map((home) => (
                  <tr key={home.id} className="border-t border-border hover:bg-muted/30">
                    <td className="py-4 px-4">
                      <p className="font-medium text-foreground">{home.lot}</p>
                      <p className="text-sm text-muted-foreground">{home.address}</p>
                    </td>
                    <td className="py-4 px-4 text-sm text-foreground">{home.buyerName}</td>
                    <td className="py-4 px-4"><StatusBadge status={home.status} /></td>
                    <td className="py-4 px-4 text-center">
                      {home.flooringCompleted ? <CheckCircle2 className="w-5 h-5 text-success mx-auto" /> : <XCircle className="w-5 h-5 text-muted-foreground mx-auto" />}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {home.windowExtensions ? <CheckCircle2 className="w-5 h-5 text-success mx-auto" /> : <XCircle className="w-5 h-5 text-muted-foreground mx-auto" />}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {home.windowExtensionTotal > 0 ? <span className="font-medium">${home.windowExtensionTotal.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedHome(home)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleGeneratePDF(home)}
                          disabled={generatingPDF === home.id || !home.selections}
                          title="Download PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={!!selectedHome} onOpenChange={() => setSelectedHome(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedHome && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-serif text-xl">{selectedHome.lot} — {selectedHome.address}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                  <div className="p-4 rounded-lg bg-secondary/30">
                    <h4 className="font-medium text-foreground mb-2">Buyer</h4>
                    <p className="text-sm text-muted-foreground">{selectedHome.buyerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <StatusBadge status={selectedHome.status} />
                  </div>
                  
                  {selectedHome.selections && (
                    <div className="space-y-4">
                      <h4 className="font-medium text-foreground">Selections</h4>
                      <div className="grid gap-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Main Floor LVP</span>
                          <span className="font-medium">{lvpOptions.find(o => o.id === selectedHome.selections?.lvpColour)?.name || 'Not selected'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Bathroom SPC</span>
                          <span className="font-medium">{spcTileOptions.find(o => o.id === selectedHome.selections?.spcTileColour)?.name || 'Not selected'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Backsplash</span>
                          <span className="font-medium capitalize">{selectedHome.selections.backsplashOrientation || 'Not selected'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Stairs Carpet</span>
                          <span className="font-medium">{carpetOptions.find(o => o.id === selectedHome.selections?.stairCarpetColour)?.name || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Additional Windows</span>
                          <span className="font-medium">{selectedHome.selections.additionalWindowsQty}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-border">
                          <span className="text-muted-foreground">Patio Doors</span>
                          <span className="font-medium">{selectedHome.selections.patioDoorsQty}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {selectedHome.windowExtensionTotal > 0 && (
                    <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                      <h4 className="font-medium text-foreground mb-1">Window Extension Total</h4>
                      <p className="text-2xl font-serif font-semibold text-primary">${selectedHome.windowExtensionTotal.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Subtotal: ${selectedHome.windowExtensionSubtotal.toLocaleString()} + GST: ${selectedHome.windowExtensionGST.toLocaleString()}</p>
                    </div>
                  )}

                  {/* PDF Download Button */}
                  {selectedHome.selections && (
                    <Button 
                      onClick={() => handleGeneratePDF(selectedHome)} 
                      disabled={generatingPDF === selectedHome.id}
                      className="w-full gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      {generatingPDF === selectedHome.id ? 'Generating PDF...' : 'Download Selection Summary PDF'}
                    </Button>
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
