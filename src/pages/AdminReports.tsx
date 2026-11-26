import { useState, useEffect, useMemo } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { lvpOptions, bathLaundryFloorOptions, carpetOptions } from '@/lib/mockData';
import { Download, FileText, FileSpreadsheet, Printer, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { useSubmissionLineTotals } from '@/hooks/useSubmissionLineTotals';
import { gatedFigure, lineTotalsGate } from '@/lib/lineTotalsGate';

type BuyerSelection = Tables<'buyer_selections'>;

interface ReportStats {
  totalSubmissions: number;
  submittedCount: number;
  windowExtensionHomes: number;
  totalWindowSubtotal: number;
  totalWindowGST: number;
  totalWindowRevenue: number;
}

export default function AdminReports() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);
  // Window coverings figures per submission: sumQuoteLines over its window_coverings lines.
  const lineTotals = useSubmissionLineTotals(submissions);
  // Every report and export below carries window totals: none runs until the lines are loaded (never $0.00 rows).
  const totalsGate = lineTotalsGate(lineTotals);
  const totalsNotReady = () => {
    if (totalsGate.ready) return false;
    toast.error('Totals are not ready', { description: totalsGate.message ?? undefined });
    return true;
  };
  const windowTotalsOf = (s: BuyerSelection) => lineTotals.sectionTotalsOf(s.id, 'window_coverings');
  const windowSubtotalOf = (s: BuyerSelection) => windowTotalsOf(s).subtotal;
  const stats: ReportStats = useMemo(() => {
    const windows = submissions.map((s) => lineTotals.sectionTotalsOf(s.id, 'window_coverings'));
    return {
      totalSubmissions: submissions.length,
      submittedCount: submissions.filter(s => s.status === 'submitted').length,
      windowExtensionHomes: windows.filter((w) => w.subtotal > 0).length,
      totalWindowSubtotal: windows.reduce((sum, w) => sum + w.subtotal, 0),
      totalWindowGST: windows.reduce((sum, w) => sum + w.gst, 0),
      totalWindowRevenue: windows.reduce((sum, w) => sum + w.total, 0),
    };
  }, [submissions, lineTotals]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const subs = data || [];
      setSubmissions(subs);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateSelectionsSummaryCSV = () => {
    if (totalsNotReady()) return;
    if (submissions.length === 0) {
      toast.error('No submissions to export');
      return;
    }

    setGenerating('selections-csv');
    
    const headers = [
      'Unit Number',
      'Unit Type',
      'First Name',
      'Last Name',
      'Email',
      'Phone',
      'LVP Colour',
      'SPC Tile',
      'Backsplash',
      'Stair Carpet',
      'Bedroom Flooring',
      'Bedroom Carpet',
      'Add. Windows',
      'Patio Doors',
      'Window Subtotal (pre-GST)',
      'Status',
      'Submitted Date',
      'Sales Comments'
    ];

    const rows = submissions.map(s => [
      s.unit_number || '',
      s.unit_type || '',
      s.first_name || '',
      s.last_name || '',
      s.email || '',
      s.phone_number || '',
      s.lvp_colour || '',
      s.spc_tile_colour || '',
      s.backsplash_orientation || '',
      s.stair_carpet_colour || '',
      s.bedroom_flooring_choice || '',
      s.bedroom_carpet_colour || '',
      s.additional_windows_qty || 0,
      s.patio_doors_qty || 0,
      windowSubtotalOf(s).toFixed(2),
      s.status || '',
      s.created_at ? new Date(s.created_at).toLocaleDateString() : '',
      (s.sales_comments || '').replace(/,/g, ';').replace(/\n/g, ' ')
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selections-summary-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    setGenerating(null);
    toast.success('CSV exported successfully');
  };

  const generateAllSelectionsPDFReport = async () => {
    if (totalsNotReady()) return;
    if (submissions.length === 0) {
      toast.error('No submissions to export');
      return;
    }

    setGenerating('all-pdf');
    try {
      // Create a simple text-based report since we don't have the PDF generator set up for real data
      const lines = [
        'BMD MATERIALS - BUYER SELECTIONS REPORT',
        `Generated: ${new Date().toLocaleString()}`,
        '='.repeat(60),
        '',
      ];

      submissions.forEach((s, idx) => {
        lines.push(`${idx + 1}. Unit ${s.unit_number} - ${s.first_name} ${s.last_name}`);
        lines.push(`   Email: ${s.email}`);
        lines.push(`   Phone: ${s.phone_number || 'N/A'}`);
        lines.push(`   LVP: ${s.lvp_colour || 'Not selected'}`);
        lines.push(`   SPC Tile: ${s.spc_tile_colour || 'Not selected'}`);
        lines.push(`   Backsplash: ${s.backsplash_orientation || 'Not selected'}`);
        if (s.has_stairs) {
          lines.push(`   Stair Carpet: ${s.stair_carpet_colour || 'Not selected'}`);
        }
        lines.push(`   Bedroom: ${s.bedroom_flooring_choice || 'Not selected'}`);
        if ((s.additional_windows_qty || 0) > 0 || (s.patio_doors_qty || 0) > 0) {
          lines.push(`   Window Add-ons: ${s.additional_windows_qty || 0} windows, ${s.patio_doors_qty || 0} patio doors`);
          lines.push(`   Window Subtotal (before GST): $${windowSubtotalOf(s).toFixed(2)}`);
        }
        if (s.sales_comments) {
          lines.push(`   Sales Notes: ${s.sales_comments}`);
        }
        lines.push(`   Status: ${s.status}`);
        lines.push(`   Submitted: ${new Date(s.created_at).toLocaleDateString()}`);
        lines.push('');
      });

      const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `all-selections-${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success('Report generated', { description: 'All selections exported.' });
    } catch (error) {
      toast.error('Failed to generate report');
      console.error(error);
    } finally {
      setGenerating(null);
    }
  };

  const generateQuantitiesReport = () => {
    if (totalsNotReady()) return;
    if (submissions.length === 0) {
      toast.error('No submissions to analyze');
      return;
    }

    setGenerating('quantities');
    
    const lvpCounts: Record<string, number> = {};
    const spcCounts: Record<string, number> = {};
    const carpetCounts: Record<string, number> = {};
    const backsplashCounts: Record<string, number> = {};
    let totalWindows = 0;
    let totalPatio = 0;

    submissions.forEach(s => {
      if (s.lvp_colour) {
        lvpCounts[s.lvp_colour] = (lvpCounts[s.lvp_colour] || 0) + 1;
      }
      if (s.spc_tile_colour) {
        spcCounts[s.spc_tile_colour] = (spcCounts[s.spc_tile_colour] || 0) + 1;
      }
      if (s.stair_carpet_colour) {
        carpetCounts[s.stair_carpet_colour] = (carpetCounts[s.stair_carpet_colour] || 0) + 1;
      }
      if (s.bedroom_carpet_colour) {
        carpetCounts[s.bedroom_carpet_colour] = (carpetCounts[s.bedroom_carpet_colour] || 0) + 1;
      }
      if (s.backsplash_orientation) {
        backsplashCounts[s.backsplash_orientation] = (backsplashCounts[s.backsplash_orientation] || 0) + 1;
      }
      totalWindows += s.additional_windows_qty || 0;
      totalPatio += s.patio_doors_qty || 0;
    });

    const lines = [
      'BMD MATERIALS - MATERIAL QUANTITIES REPORT',
      `Generated: ${new Date().toLocaleString()}`,
      `Total Submissions: ${submissions.length}`,
      '='.repeat(50),
      '',
      'LVP COLOURS:',
      ...lvpOptions.map(o => `  ${o.name}: ${lvpCounts[o.id] || 0}`),
      '',
      'BATHROOM / LAUNDRY FLOORING (tile or plank):',
      ...bathLaundryFloorOptions.map(o => `  ${o.name}: ${spcCounts[o.id] || 0}`),
      '',
      'CARPET:',
      ...carpetOptions.map(o => `  ${o.name}: ${carpetCounts[o.id] || 0}`),
      '',
      'BACKSPLASH ORIENTATIONS:',
      `  Stacked: ${backsplashCounts['stacked'] || 0}`,
      `  Bricked: ${backsplashCounts['bricked'] || 0}`,
      `  Vertical: ${backsplashCounts['vertical'] || 0}`,
      '',
      'WINDOW COVERINGS:',
      `  Additional Windows: ${totalWindows}`,
      `  Patio Doors: ${totalPatio}`,
      '',
      'REVENUE:',
      `  Subtotal: $${stats.totalWindowSubtotal.toLocaleString()}`,
      `  GST: $${stats.totalWindowGST.toLocaleString()}`,
      `  Total: $${stats.totalWindowRevenue.toLocaleString()}`
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantities-report-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    setGenerating(null);
    toast.success('Quantities report exported');
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Reports & Exports</h1>
            <p className="text-muted-foreground mt-1">Generate reports from real submission data</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-medium text-foreground mb-4">Report Summary</h3>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Submissions</p>
                <p className="text-2xl font-serif font-semibold">{stats.totalSubmissions}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Submitted Status</p>
                <p className="text-2xl font-serif font-semibold">{stats.submittedCount}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">With Window Add-ons</p>
                <p className="text-2xl font-serif font-semibold">{gatedFigure(totalsGate, () => String(stats.windowExtensionHomes))}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-serif font-semibold text-primary">{gatedFigure(totalsGate, () => `$${stats.totalWindowRevenue.toLocaleString()}`)}</p>
              </div>
            </div>
          )}
          {!loading && totalsGate.message && (
            <p role={totalsGate.state === 'error' ? 'alert' : 'status'}
              className={`mt-3 text-sm ${totalsGate.state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {totalsGate.message}
            </p>
          )}
        </div>

        {/* PDF Reports */}
        <div>
          <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Reports</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="p-6 rounded-xl border border-primary/30 bg-primary/5">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/20">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-serif text-lg font-semibold text-foreground">All Selections Report</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Complete report of all buyer submissions with detailed selection information.
                  </p>
                  <Button
                    onClick={generateAllSelectionsPDFReport}
                    disabled={generating === 'all-pdf' || loading || !totalsGate.ready || submissions.length === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {generating === 'all-pdf' ? 'Generating...' : 'Download Report'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-accent/20">
                  <Printer className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Individual Buyer Reports</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    View and manage individual submissions. Available from the Submissions page.
                  </p>
                  <Button variant="outline" onClick={() => window.location.href = '/admin/submissions'}>
                    Go to Submissions →
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Exports */}
        <div>
          <h3 className="font-serif text-lg font-semibold text-foreground mb-4">Data Exports</h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Selections Summary CSV</h3>
                  <p className="text-sm text-muted-foreground mb-4">Complete export of all buyer selections for spreadsheet analysis.</p>
                  <Button
                    variant="outline"
                    onClick={generateSelectionsSummaryCSV}
                    disabled={generating === 'selections-csv' || loading || !totalsGate.ready || submissions.length === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {generating === 'selections-csv' ? 'Generating...' : 'Download CSV'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Material Quantities</h3>
                  <p className="text-sm text-muted-foreground mb-4">Aggregated quantities for ordering and estimating.</p>
                  <Button
                    variant="outline"
                    onClick={generateQuantitiesReport}
                    disabled={generating === 'quantities' || loading || !totalsGate.ready || submissions.length === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {generating === 'quantities' ? 'Generating...' : 'Download TXT'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {submissions.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No submissions found. Reports will be available once buyers submit their selections.
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
