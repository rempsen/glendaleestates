import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { homes, flooringOptions, windowPricing } from '@/lib/mockData';
import { Download, FileText, FileSpreadsheet, Printer } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminReports() {
  const [generating, setGenerating] = useState<string | null>(null);

  const generateSelectionsSummary = () => {
    setGenerating('selections');
    
    const csv = [
      ['Lot', 'Address', 'Buyer Name', 'Main Floor LVP', 'Washroom SPC', 'Backsplash', 'Stairs Carpet', 'Bedroom Carpet', 'Additional Windows', 'Patio Doors', 'Upgrade Value'].join(','),
      ...homes.filter(h => h.selections).map(h => {
        const s = h.selections!;
        return [
          h.lot,
          h.address,
          h.buyerName,
          flooringOptions.mainFloorLVP.find(o => o.id === s.mainFloorLVP)?.name || '',
          flooringOptions.washroomSPC.find(o => o.id === s.washroomSPC)?.name || '',
          s.backsplashOrientation || '',
          flooringOptions.carpetColors.find(o => o.id === s.stairsCarpet)?.name || '',
          flooringOptions.carpetColors.find(o => o.id === s.bedroomCarpetColor)?.name || '',
          s.additionalWindows,
          s.patioDoors,
          h.estimatedUpgradeValue
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'selections-summary.csv';
    a.click();
    
    setGenerating(null);
    toast.success('Selections summary exported');
  };

  const generateQuantitiesReport = () => {
    setGenerating('quantities');
    
    // Aggregate quantities
    const mainFloorCounts: Record<string, number> = {};
    const washroomCounts: Record<string, number> = {};
    const carpetCounts: Record<string, number> = {};
    let totalAdditionalWindows = 0;
    let totalPatioDoors = 0;

    homes.forEach(h => {
      if (h.selections) {
        const s = h.selections;
        if (s.mainFloorLVP) mainFloorCounts[s.mainFloorLVP] = (mainFloorCounts[s.mainFloorLVP] || 0) + 1;
        if (s.washroomSPC) washroomCounts[s.washroomSPC] = (washroomCounts[s.washroomSPC] || 0) + 1;
        if (s.stairsCarpet) carpetCounts[s.stairsCarpet] = (carpetCounts[s.stairsCarpet] || 0) + 1;
        if (s.bedroomCarpetColor) carpetCounts[s.bedroomCarpetColor] = (carpetCounts[s.bedroomCarpetColor] || 0) + 1;
        totalAdditionalWindows += s.additionalWindows;
        totalPatioDoors += s.patioDoors;
      }
    });

    const lines = [
      'GLENDALE ESTATES - MATERIAL QUANTITIES REPORT',
      '='.repeat(50),
      '',
      'MAIN FLOOR LVP:',
      ...flooringOptions.mainFloorLVP.map(o => `  ${o.name}: ${mainFloorCounts[o.id] || 0} units`),
      '',
      'WASHROOM/LAUNDRY SPC:',
      ...flooringOptions.washroomSPC.map(o => `  ${o.name}: ${washroomCounts[o.id] || 0} units`),
      '',
      'CARPET COLORS:',
      ...flooringOptions.carpetColors.map(o => `  ${o.name}: ${carpetCounts[o.id] || 0} units`),
      '',
      'WINDOW COVERINGS:',
      `  Additional Windows: ${totalAdditionalWindows} units`,
      `  Patio Door Panels: ${totalPatioDoors} units`,
      '',
      'REVENUE SUMMARY:',
      `  Window Extensions Revenue: $${(totalAdditionalWindows * windowPricing.additionalWindow).toLocaleString()}`,
      `  Patio Door Revenue: $${(totalPatioDoors * windowPricing.patioDoor).toLocaleString()}`,
      `  Total (pre-GST): $${((totalAdditionalWindows * windowPricing.additionalWindow) + (totalPatioDoors * windowPricing.patioDoor)).toLocaleString()}`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quantities-report.txt';
    a.click();
    
    setGenerating(null);
    toast.success('Quantities report exported');
  };

  const reports = [
    {
      id: 'selections',
      title: 'Selections Summary',
      description: 'Complete export of all buyer selections including flooring choices, window quantities, and upgrade values.',
      icon: FileSpreadsheet,
      action: generateSelectionsSummary,
      format: 'CSV',
    },
    {
      id: 'quantities',
      title: 'Material Quantities',
      description: 'Aggregated quantities for ordering and estimating. Includes all flooring types, carpet colors, and window coverings.',
      icon: FileText,
      action: generateQuantitiesReport,
      format: 'TXT',
    },
  ];

  // Quick stats for the page
  const submittedCount = homes.filter(h => ['submitted', 'reviewed', 'finalized'].includes(h.status)).length;
  const windowExtensions = homes.filter(h => h.windowExtensions).length;
  const totalRevenue = homes.reduce((sum, h) => sum + h.estimatedUpgradeValue, 0);

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
            Reports & Exports
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate reports for operations, estimating, and management
          </p>
        </div>

        {/* Quick Stats */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-medium text-foreground mb-4">Report Data Summary</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Submitted Selections</p>
              <p className="text-2xl font-serif font-semibold text-foreground">{submittedCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Homes with Add-ons</p>
              <p className="text-2xl font-serif font-semibold text-foreground">{windowExtensions}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Upgrade Revenue</p>
              <p className="text-2xl font-serif font-semibold text-primary">${totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Available Reports */}
        <div className="grid gap-6 md:grid-cols-2">
          {reports.map((report) => (
            <div 
              key={report.id}
              className="p-6 rounded-xl border border-border bg-card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <report.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-serif text-lg font-semibold text-foreground">
                      {report.title}
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                      {report.format}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    {report.description}
                  </p>
                  <Button 
                    onClick={report.action}
                    disabled={generating === report.id}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {generating === report.id ? 'Generating...' : 'Download Report'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Coming Soon */}
        <div className="p-6 rounded-xl border border-dashed border-border bg-muted/30">
          <div className="flex items-center gap-3 mb-4">
            <Printer className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-serif text-lg font-semibold text-foreground">
              Coming Soon
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="p-4 rounded-lg bg-card border border-border">
              <p className="font-medium text-foreground">Buyer Summary PDF</p>
              <p className="text-xs text-muted-foreground">Individual selection summaries for each buyer</p>
            </div>
            <div className="p-4 rounded-lg bg-card border border-border">
              <p className="font-medium text-foreground">Installation Schedule</p>
              <p className="text-xs text-muted-foreground">Timeline and scheduling export</p>
            </div>
            <div className="p-4 rounded-lg bg-card border border-border">
              <p className="font-medium text-foreground">Financial Report</p>
              <p className="text-xs text-muted-foreground">Revenue breakdown by category</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
