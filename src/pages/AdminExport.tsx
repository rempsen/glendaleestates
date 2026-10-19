import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  CalendarIcon,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  Database,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';

import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { generateSubmissionPDF } from '@/lib/submissionPdfGenerator';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { useUnitAreaData } from '@/hooks/useUnitAreaData';
import {
  type BuyerSelection,
  type ExportPricing,
} from '@/lib/submissionExportBuilder';
import { buildFlatExport } from '@/lib/submissionFlatExport';
import { fetchDownstreamData, type DownstreamData } from '@/lib/fetchDownstreamData';

const STATUS_OPTIONS = ['submitted', 'in_review', 'quoted', 'completed', 'cancelled'];

const downloadBlob = (content: BlobPart, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const sanitize = (s: string) => s.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60);

// Build a single XLSX workbook with one sheet, grouped header banner row + sub-header.
function buildSingleSheetXlsx(
  targets: BuyerSelection[],
  pricing: ExportPricing,
  downstream: DownstreamData,
): ArrayBuffer {
  const flat = buildFlatExport(targets, pricing, downstream);

  // Row 1: group banner (one cell per group, then merged across its span)
  // Row 2: column sub-headers
  // Row 3+: data
  const aoa: (string | number | boolean | null)[][] = [];

  const bannerRow: (string | number | boolean | null)[] = [];
  flat.groups.forEach((g) => {
    bannerRow.push(g.name);
    for (let i = 1; i < g.span; i++) bannerRow.push('');
  });
  aoa.push(bannerRow);
  aoa.push(flat.columns.map((c) => c.label));
  for (const r of flat.rows) aoa.push(r);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merges for the group banner row
  const merges: XLSX.Range[] = [];
  let cursor = 0;
  flat.groups.forEach((g) => {
    if (g.span > 1) {
      merges.push({ s: { r: 0, c: cursor }, e: { r: 0, c: cursor + g.span - 1 } });
    }
    cursor += g.span;
  });
  ws['!merges'] = merges;

  // Column widths: rough auto-fit based on header label length
  ws['!cols'] = flat.columns.map((c) => ({ wch: Math.min(40, Math.max(12, c.label.length + 2)) }));

  // Freeze top two header rows + first column (Unit #)
  ws['!freeze'] = { xSplit: 1, ySplit: 2 } as unknown as XLSX.WorkSheet['!freeze'];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Submissions');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export default function AdminExport() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<BuyerSelection[]>([]);

  // Filters
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [unitType, setUnitType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [emailQuery, setEmailQuery] = useState('');

  // Pricing
  const {
    loaded: pricingLoaded,
    markupPercentage,
    gstRate,
    getMaterialCost,
    getAdditionalWindowPrice,
    getPatioDoorPrice,
    getAutomatedMotorPrice,
    getHeatedFloorPrice,
    getGroutColorChangePrice,
    getStairLvpUpgradePrice,
    getStairPremiumLvpUpgradePrice,
    getStairCarpetUpgradePrice,
  } = useDynamicPricing();
  const { unitAreaData } = useUnitAreaData();

  const exportPricing: ExportPricing = useMemo(() => ({
    markupPercentage,
    gstRate,
    patioDoorPrice: getPatioDoorPrice(),
    additionalWindowPrice: getAdditionalWindowPrice(),
    automatedMotorPrice: getAutomatedMotorPrice(),
    heatedFloorPrice: getHeatedFloorPrice(),
    backsplashGroutPrice: getGroutColorChangePrice(),
    stairLvpUpgradePrice: getStairLvpUpgradePrice(),
    stairCarpetUpgradePrice: getStairCarpetUpgradePrice(),
    getMaterialCost,
    getUnitAreaData: (code: string) => {
      const row = unitAreaData.find(
        (u) => u.unit_type_code?.toUpperCase() === code?.toUpperCase(),
      );
      if (!row) return null;
      return {
        allLvp: Number(row.all_lvp) || 0,
        mainLiving: Number(row.main_living) || 0,
        secondBedroom: Number(row.second_bedroom) || 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        masterBedroomLvp: Number((row as any).master_bedroom_lvp) || 0,
        masterBedroom: Number(row.master_bedroom) || 0,
        secondBedroomCarpet: Number(row.second_bedroom_carpet) || 0,
        guestBathroom: Number(row.guest_bathroom) || 0,
        masterEnsuite: Number(row.master_ensuite) || 0,
        laundry: Number(row.laundry) || 0,
        backsplash: Number(row.backsplash) || 0,
      };
    },
  }), [
    markupPercentage, gstRate, getPatioDoorPrice, getAdditionalWindowPrice,
    getAutomatedMotorPrice, getHeatedFloorPrice, getGroutColorChangePrice,
    getStairLvpUpgradePrice,
    getStairPremiumLvpUpgradePrice, getStairCarpetUpgradePrice, getMaterialCost,
    unitAreaData,
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('*')
        .order('unit_number', { ascending: true });
      if (error) throw error;
      setSubmissions((data || []) as BuyerSelection[]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const unitTypes = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      if (s.unit_type) set.add(s.unit_type);
    });
    return Array.from(set).sort();
  }, [submissions]);

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (startDate && new Date(s.created_at) < startDate) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (new Date(s.created_at) > end) return false;
      }
      if (unitType !== 'all' && s.unit_type !== unitType) return false;
      if (status !== 'all' && s.status !== status) return false;
      if (
        emailQuery.trim() &&
        !(s.email || '').toLowerCase().includes(emailQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [submissions, startDate, endDate, unitType, status, emailQuery]);

  const clearFilters = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setUnitType('all');
    setStatus('all');
    setEmailQuery('');
  };

  // ---------- Exports ----------
  const ensureReady = (): boolean => {
    if (!pricingLoaded) {
      toast.error('Pricing data still loading — try again in a moment');
      return false;
    }
    if (filtered.length === 0) {
      toast.error('No submissions match the current filters');
      return false;
    }
    return true;
  };

  const exportXlsxAll = async () => {
    if (!ensureReady()) return;
    setGenerating('xlsx-all');
    try {
      const downstream = await fetchDownstreamData(filtered.map((s) => s.id));
      const buf = buildSingleSheetXlsx(filtered, exportPricing, downstream);
      downloadBlob(
        buf,
        `submissions-export-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      toast.success(`Exported ${filtered.length} submissions`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate XLSX');
    } finally {
      setGenerating(null);
    }
  };

  const exportSingleClient = async (s: BuyerSelection) => {
    if (!pricingLoaded) {
      toast.error('Pricing data still loading — try again in a moment');
      return;
    }
    setGenerating(`xlsx-${s.id}`);
    try {
      const downstream = await fetchDownstreamData([s.id]);
      const baseName = `${sanitize(s.unit_number || 'unit')}_${sanitize(s.last_name || 'client')}_${format(new Date(), 'yyyy-MM-dd')}`;
      const buf = buildSingleSheetXlsx([s], exportPricing, downstream);
      downloadBlob(
        buf,
        `${baseName}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      toast.success(`Exported ${s.first_name} ${s.last_name}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to export client');
    } finally {
      setGenerating(null);
    }
  };

  const exportPdfBundle = async () => {
    if (filtered.length === 0) {
      toast.error('No submissions match the current filters');
      return;
    }
    setGenerating('pdf-bundle');
    try {
      for (const s of filtered) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await generateSubmissionPDF(s as any);
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(`Generated ${filtered.length} PDFs`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate one or more PDFs');
    } finally {
      setGenerating(null);
    }
  };

  const activeFilterCount = [
    startDate,
    endDate,
    unitType !== 'all' ? unitType : null,
    status !== 'all' ? status : null,
    emailQuery.trim() ? emailQuery : null,
  ].filter(Boolean).length;

  const busy = loading || generating !== null || !pricingLoaded;

  // Preview group banner for the "Sections covered" card
  const previewGroups = useMemo(() => {
    if (!pricingLoaded) return [];
    try {
      return buildFlatExport(filtered.length ? filtered : submissions, exportPricing).groups;
    } catch {
      return [];
    }
  }, [pricingLoaded, filtered, submissions, exportPricing]);

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              Export Submissions
            </h1>
            <p className="text-muted-foreground mt-1">
              Single-tab Excel export — one row per client, grouped section headers across the top.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-2">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-medium text-foreground">Filters</h3>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-2">{activeFilterCount} active</Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Start date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : 'Any'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : 'Any'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Unit type</Label>
              <Select value={unitType} onValueChange={setUnitType}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All unit types</SelectItem>
                  {unitTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label>Buyer email contains</Label>
              <Input
                placeholder="e.g. smith@example.com"
                value={emailQuery}
                onChange={(e) => setEmailQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-2 text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${filtered.length} of ${submissions.length} submission${submissions.length === 1 ? '' : 's'} match`}
          </div>
        </div>

        {/* Bulk export actions */}
        <div>
          <h2 className="font-serif text-lg font-semibold text-foreground mb-1">
            Bulk export ({filtered.length} clients)
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Single-tab Excel: column A = Unit #, column B = Name, then every selection grouped by section.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="p-6 rounded-xl border border-primary/30 bg-primary/5 flex flex-col">
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 rounded-lg bg-primary/20">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                    Excel workbook (.xlsx)
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    All clients on one sheet. Grouped section banners across the top, one row per client.
                  </p>
                </div>
              </div>
              <Button
                onClick={exportXlsxAll}
                disabled={busy || filtered.length === 0}
                className="gap-2 w-full"
              >
                <Download className="w-4 h-4" />
                {generating === 'xlsx-all' ? 'Generating…' : 'Download XLSX'}
              </Button>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card flex flex-col">
              <div className="flex items-start gap-4 flex-1">
                <div className="p-3 rounded-lg bg-muted">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                    PDF bundle
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    One admin PDF per matching submission.
                  </p>
                </div>
              </div>
              <Button
                onClick={exportPdfBundle}
                disabled={busy || filtered.length === 0}
                className="gap-2 w-full"
                variant="outline"
              >
                <Download className="w-4 h-4" />
                {generating === 'pdf-bundle'
                  ? `Generating ${filtered.length}…`
                  : `Download ${filtered.length} PDF${filtered.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>

        {/* Section groups preview */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium text-foreground">Column groups in the export</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {previewGroups.map((g, i) => (
              <div key={`${g.name}-${i}`} className="flex items-start gap-2">
                <span className="text-muted-foreground tabular-nums w-6">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <div className="text-foreground">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.span} column{g.span === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Per-client list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium text-foreground">Per-client export</h3>
            <span className="ml-2 text-xs text-muted-foreground">
              Download a single-row XLSX for one client
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No submissions match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Unit</th>
                    <th className="text-left font-medium px-4 py-2">Type</th>
                    <th className="text-left font-medium px-4 py-2">Buyer</th>
                    <th className="text-left font-medium px-4 py-2">Email</th>
                    <th className="text-left font-medium px-4 py-2">Status</th>
                    <th className="text-left font-medium px-4 py-2">Submitted</th>
                    <th className="text-right font-medium px-4 py-2">Export</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{s.unit_number}</td>
                      <td className="px-4 py-2 text-muted-foreground">{s.unit_type ?? '—'}</td>
                      <td className="px-4 py-2">{s.first_name} {s.last_name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{s.email}</td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary">{s.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {s.created_at ? format(new Date(s.created_at), 'yyyy-MM-dd') : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => exportSingleClient(s)}
                            className="gap-1"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            {generating === `xlsx-${s.id}` ? '…' : 'XLSX'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
