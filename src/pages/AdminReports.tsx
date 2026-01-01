import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { homes, lvpOptions, spcTileOptions, carpetOptions, windowPricing, getDashboardStats } from '@/lib/mockData';
import { Download, FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminReports() {
  const [generating, setGenerating] = useState<string | null>(null);
  const stats = getDashboardStats();

  const generateSelectionsSummary = () => {
    setGenerating('selections');
    const csv = [
      ['Lot', 'Address', 'Buyer Name', 'LVP Colour', 'SPC Tile', 'Backsplash', 'Stair Carpet', 'Bedroom Carpet', 'Add. Windows', 'Patio Doors', 'Window Total'].join(','),
      ...homes.filter(h => h.selections).map(h => {
        const s = h.selections!;
        return [h.lot, h.address, h.buyerName, lvpOptions.find(o => o.id === s.lvpColour)?.name || '', spcTileOptions.find(o => o.id === s.spcTileColour)?.name || '', s.backsplashOrientation || '', carpetOptions.find(o => o.id === s.stairCarpetColour)?.name || '', carpetOptions.find(o => o.id === s.bedroomCarpetColour)?.name || '', s.additionalWindowsQty, s.patioDoorsQty, h.windowExtensionTotal].join(',');
      })
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'selections-summary.csv'; a.click();
    setGenerating(null); toast.success('Selections summary exported');
  };

  const generateQuantitiesReport = () => {
    setGenerating('quantities');
    const lvpCounts: Record<string, number> = {}; const spcCounts: Record<string, number> = {}; const carpetCounts: Record<string, number> = {};
    let totalWindows = 0; let totalPatio = 0;
    homes.forEach(h => {
      if (h.selections) {
        if (h.selections.lvpColour) lvpCounts[h.selections.lvpColour] = (lvpCounts[h.selections.lvpColour] || 0) + 1;
        if (h.selections.spcTileColour) spcCounts[h.selections.spcTileColour] = (spcCounts[h.selections.spcTileColour] || 0) + 1;
        if (h.selections.stairCarpetColour) carpetCounts[h.selections.stairCarpetColour] = (carpetCounts[h.selections.stairCarpetColour] || 0) + 1;
        if (h.selections.bedroomCarpetColour) carpetCounts[h.selections.bedroomCarpetColour] = (carpetCounts[h.selections.bedroomCarpetColour] || 0) + 1;
        totalWindows += h.selections.additionalWindowsQty; totalPatio += h.selections.patioDoorsQty;
      }
    });
    const lines = ['GLENDALE ESTATES - MATERIAL QUANTITIES', '='.repeat(50), '', 'LVP COLOURS:', ...lvpOptions.map(o => `  ${o.name}: ${lvpCounts[o.id] || 0}`), '', 'SPC TILE:', ...spcTileOptions.map(o => `  ${o.name}: ${spcCounts[o.id] || 0}`), '', 'CARPET:', ...carpetOptions.map(o => `  ${o.name}: ${carpetCounts[o.id] || 0}`), '', 'WINDOW COVERINGS:', `  Additional Windows: ${totalWindows}`, `  Patio Doors: ${totalPatio}`, '', 'REVENUE:', `  Subtotal: $${stats.totalWindowSubtotal.toLocaleString()}`, `  GST: $${stats.totalWindowGST.toLocaleString()}`, `  Total: $${stats.totalWindowRevenue.toLocaleString()}`];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'quantities-report.txt'; a.click();
    setGenerating(null); toast.success('Quantities report exported');
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div><h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Reports & Exports</h1><p className="text-muted-foreground mt-1">Generate reports for operations and estimating</p></div>

        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-medium text-foreground mb-4">Summary</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><p className="text-sm text-muted-foreground">Submitted</p><p className="text-2xl font-serif font-semibold">{stats.completedCount}</p></div>
            <div><p className="text-sm text-muted-foreground">With Window Add-ons</p><p className="text-2xl font-serif font-semibold">{stats.windowExtensionHomes}</p></div>
            <div><p className="text-sm text-muted-foreground">Total Revenue</p><p className="text-2xl font-serif font-semibold text-primary">${stats.totalWindowRevenue.toLocaleString()}</p></div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10"><FileSpreadsheet className="w-6 h-6 text-primary" /></div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Selections Summary</h3>
                <p className="text-sm text-muted-foreground mb-4">Complete export of all buyer selections.</p>
                <Button onClick={generateSelectionsSummary} disabled={generating === 'selections'} className="gap-2"><Download className="w-4 h-4" />{generating === 'selections' ? 'Generating...' : 'Download CSV'}</Button>
              </div>
            </div>
          </div>
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10"><FileText className="w-6 h-6 text-primary" /></div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Material Quantities</h3>
                <p className="text-sm text-muted-foreground mb-4">Aggregated quantities for ordering.</p>
                <Button onClick={generateQuantitiesReport} disabled={generating === 'quantities'} className="gap-2"><Download className="w-4 h-4" />{generating === 'quantities' ? 'Generating...' : 'Download TXT'}</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
