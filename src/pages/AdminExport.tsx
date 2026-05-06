import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  CalendarIcon,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  Database,
  Archive,
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
  EXPORT_SECTIONS,
  buildSubmissionSectionRows,
  type BuyerSelection,
  type ExportPricing,
} from '@/lib/submissionExportBuilder';

const STATUS_OPTIONS = ['submitted', 'in_review', 'quoted', 'completed', 'cancelled'];

// ---------- helpers ----------
const escapeCsv = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const rowsToCsv = (columns: string[], rows: Record<string, unknown>[]): string => {
  const header = columns.map(escapeCsv).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCsv(r[c])).join(','));
  return [header, ...body].join('\n');
};

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
    getStairLvpUpgradePrice, getStairCarpetUpgradePrice, getMaterialCost,
    unitAreaData,
  ]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('*')
        .order('created_at', { ascending: false });
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

  // ---------- Build aggregated section rows ----------
  // For each section, an array of rows aggregated across `targets`.
  const buildAggregatedRows = (targets: BuyerSelection[]) => {
    const aggregated: Record<string, Record<string, unknown>[]> = {};
    EXPORT_SECTIONS.forEach((sec) => (aggregated[sec.id] = []));
    for (const s of targets) {
      const perSubmission = buildSubmissionSectionRows(s, exportPricing);
      for (const sec of EXPORT_SECTIONS) {
        const rows = perSubmission[sec.id] || [];
        aggregated[sec.id].push(...rows);
      }
    }
    return aggregated;
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

  const exportXlsxAll = () => {
    if (!ensureReady()) return;
    setGenerating('xlsx-all');
    try {
      const aggregated = buildAggregatedRows(filtered);
      const wb = XLSX.utils.book_new();
      for (const sec of EXPORT_SECTIONS) {
        const rows = aggregated[sec.id];
        // Always write header row even if empty
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}], {
          header: sec.columns,
        });
        XLSX.utils.book_append_sheet(wb, ws, sec.name.slice(0, 31));
      }
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      downloadBlob(
        buf,
        `submissions-export-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      toast.success(`Exported ${filtered.length} submissions across ${EXPORT_SECTIONS.length} sheets`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate XLSX');
    } finally {
      setGenerating(null);
    }
  };

  const exportCsvZipAll = async () => {
    if (!ensureReady()) return;
    setGenerating('csv-zip-all');
    try {
      const aggregated = buildAggregatedRows(filtered);
      const zip = new JSZip();
      for (const sec of EXPORT_SECTIONS) {
        const csv = rowsToCsv(sec.columns, aggregated[sec.id]);
        zip.file(sec.filename, csv);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(
        blob,
        `submissions-export-${format(new Date(), 'yyyy-MM-dd')}.zip`,
        'application/zip',
      );
      toast.success(`Exported ${filtered.length} submissions in ${EXPORT_SECTIONS.length} CSV files`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate CSV ZIP');
    } finally {
      setGenerating(null);
    }
  };

  const exportSingleClient = async (s: BuyerSelection, kind: 'xlsx' | 'csv-zip') => {
    if (!pricingLoaded) {
      toast.error('Pricing data still loading — try again in a moment');
      return;
    }
    setGenerating(`${kind}-${s.id}`);
    try {
      const perSubmission = buildSubmissionSectionRows(s, exportPricing);
      const baseName = `${sanitize(s.unit_number || 'unit')}_${sanitize(s.last_name || 'client')}_${format(new Date(), 'yyyy-MM-dd')}`;

      if (kind === 'xlsx') {
        const wb = XLSX.utils.book_new();
        for (const sec of EXPORT_SECTIONS) {
          const rows = perSubmission[sec.id] || [];
          const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}], {
            header: sec.columns,
          });
          XLSX.utils.book_append_sheet(wb, ws, sec.name.slice(0, 31));
        }
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        downloadBlob(
          buf,
          `${baseName}.xlsx`,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      } else {
        const zip = new JSZip();
        for (const sec of EXPORT_SECTIONS) {
          const csv = rowsToCsv(sec.columns, perSubmission[sec.id] || []);
          zip.file(sec.filename, csv);
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(blob, `${baseName}.zip`, 'application/zip');
      }
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

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
              Export Submissions
            </h1>
            <p className="text-muted-foreground mt-1">
              Section-organized export covering every field, comment, and pricing total — admin-only data included.
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
            Each export includes 13 sections mirroring the buyer wizard, with one row per client per sheet.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
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
                    One workbook with 13 tabs (sections 1–13), every column included.
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
                <div className="p-3 rounded-lg bg-accent/20">
                  <Archive className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
                    CSV bundle (.zip)
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    13 CSV files — one per section — bundled into a single ZIP.
                  </p>
                </div>
              </div>
              <Button
                onClick={exportCsvZipAll}
                disabled={busy || filtered.length === 0}
                className="gap-2 w-full"
                variant="outline"
              >
                <Download className="w-4 h-4" />
                {generating === 'csv-zip-all' ? 'Generating…' : 'Download CSV ZIP'}
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

        {/* Sections covered */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-medium text-foreground">Sections covered in each export</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {EXPORT_SECTIONS.map((sec) => (
              <div key={sec.id} className="flex items-start gap-2">
                <span className="text-muted-foreground tabular-nums w-6">
                  {String(sec.number).padStart(2, '0')}
                </span>
                <div>
                  <div className="text-foreground">{sec.name.replace(/^\d+\s*/, '')}</div>
                  <div className="text-xs text-muted-foreground">
                    {sec.columns.length} column{sec.columns.length === 1 ? '' : 's'}
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
              Choose a client to download just that record
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
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => exportSingleClient(s, 'xlsx')}
                            className="gap-1"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            {generating === `xlsx-${s.id}` ? '…' : 'XLSX'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => exportSingleClient(s, 'csv-zip')}
                            className="gap-1"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            {generating === `csv-zip-${s.id}` ? '…' : 'CSV ZIP'}
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
