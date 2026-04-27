import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Download, FileSpreadsheet, FileText, Filter, RefreshCw, Database } from 'lucide-react';
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
import type { Tables } from '@/integrations/supabase/types';

type BuyerSelection = Tables<'buyer_selections'>;

const STATUS_OPTIONS = ['submitted', 'in_review', 'quoted', 'completed', 'cancelled'];

// ---------- CSV helpers ----------
const escapeCsv = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  let str: string;
  if (typeof value === 'object') {
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  } else {
    str = String(value);
  }
  // Always quote and escape inner quotes
  return `"${str.replace(/"/g, '""')}"`;
};

const downloadBlob = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Flatten area_upgrades jsonb into indexed columns
const flattenAreaUpgrades = (
  areaUpgrades: unknown,
  maxSlots: number,
): Record<string, string> => {
  const out: Record<string, string> = {};
  const arr = Array.isArray(areaUpgrades) ? areaUpgrades : [];
  for (let i = 0; i < maxSlots; i++) {
    const u: any = arr[i] || {};
    out[`area_upgrade_${i + 1}_areaId`] = u.areaId ?? '';
    out[`area_upgrade_${i + 1}_materialType`] = u.materialType ?? '';
    out[`area_upgrade_${i + 1}_productName`] = u.productName ?? '';
    out[`area_upgrade_${i + 1}_productColor`] = u.productColor ?? '';
    out[`area_upgrade_${i + 1}_comments`] = u.comments ?? '';
  }
  return out;
};

const flattenDocumentUploads = (docs: unknown): string => {
  if (!Array.isArray(docs)) return '';
  return docs
    .map((d: any) => {
      const name = d?.name ?? d?.fileName ?? '';
      const path = d?.path ?? d?.url ?? d?.storagePath ?? '';
      return [name, path].filter(Boolean).join('|');
    })
    .filter(Boolean)
    .join(' ; ');
};

const flattenUpgradeInterests = (interests: unknown): string => {
  if (!interests || typeof interests !== 'object') return '';
  return Object.entries(interests as Record<string, unknown>)
    .filter(([, v]) => v === true || (typeof v === 'string' && v.length > 0))
    .map(([k, v]) => (v === true ? k : `${k}=${v}`))
    .join(' ; ');
};

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyer_selections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSubmissions(data || []);
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
      if (emailQuery.trim() && !(s.email || '').toLowerCase().includes(emailQuery.trim().toLowerCase())) {
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
  const exportSummaryCsv = () => {
    if (filtered.length === 0) {
      toast.error('No submissions match the current filters');
      return;
    }
    setGenerating('summary-csv');
    const headers = [
      'Unit Number', 'Unit Type', 'First Name', 'Last Name', 'Email', 'Phone',
      'Status', 'Submitted', 'Possession Date',
      'LVP Colour', 'SPC Tile', 'Backsplash', 'Stair Carpet',
      'Bedroom Flooring', 'Bedroom Carpet',
      'Add. Windows', 'Patio Doors', 'Window Total',
    ];
    const rows = filtered.map((s) => [
      s.unit_number, s.unit_type, s.first_name, s.last_name, s.email, s.phone_number,
      s.status, s.created_at ? format(new Date(s.created_at), 'yyyy-MM-dd') : '',
      s.estimated_possession_date,
      s.lvp_colour, s.spc_tile_colour, s.backsplash_orientation, s.stair_carpet_colour,
      s.bedroom_flooring_choice, s.bedroom_carpet_colour,
      s.additional_windows_qty, s.patio_doors_qty, s.window_total,
    ]);
    const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    downloadBlob(csv, `submissions-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`, 'text/csv');
    setGenerating(null);
    toast.success(`Exported ${filtered.length} submissions`);
  };

  const exportFullCsv = () => {
    if (filtered.length === 0) {
      toast.error('No submissions match the current filters');
      return;
    }
    setGenerating('full-csv');

    // Determine max area_upgrades length for indexed columns
    const maxAreaUpgrades = filtered.reduce((max, s) => {
      const len = Array.isArray(s.area_upgrades) ? (s.area_upgrades as unknown[]).length : 0;
      return Math.max(max, len);
    }, 0);

    // Base columns = every column on buyer_selections, in a stable order
    const baseColumns: (keyof BuyerSelection)[] = [
      'id', 'created_at', 'updated_at',
      'unit_number', 'unit_type',
      'first_name', 'last_name', 'email', 'phone_number',
      'estimated_possession_date',
      'has_stairs',
      'lvp_colour', 'lvp_comments',
      'spc_tile_colour', 'spc_tile_comments',
      'backsplash_orientation',
      'backsplash_grout_enabled', 'backsplash_grout_color', 'backsplash_grout_comments',
      'stair_carpet_colour', 'stair_lvp_upgrade_selected', 'stair_upgrade_type',
      'bedroom_flooring_choice', 'bedroom_carpet_colour',
      'bedroom_lvp_colour', 'bedroom_lvp_same_as_main',
      'premium_carpet_bedroom', 'premium_underpad_bedroom', 'premium_underpad_stairs',
      'additional_windows_qty', 'patio_doors_qty', 'window_total', 'window_comments',
      'hardwood_upgrade_selected', 'custom_tiled_shower',
      'bathroom_tile_selected', 'heated_floor_bathrooms',
      'upgrade_floor_selection',
      'upgrade_comments', 'upgrade_interests_notes', 'sales_comments',
      'admin_notes',
      'status', 'reviewed_at', 'quoted_at', 'completed_at',
      'floor_plan_annotations',
    ];

    const flattenedHeaders: string[] = [];
    for (let i = 0; i < maxAreaUpgrades; i++) {
      flattenedHeaders.push(
        `area_upgrade_${i + 1}_areaId`,
        `area_upgrade_${i + 1}_materialType`,
        `area_upgrade_${i + 1}_productName`,
        `area_upgrade_${i + 1}_productColor`,
        `area_upgrade_${i + 1}_comments`,
      );
    }
    const headers = [
      ...baseColumns.map((c) => String(c)),
      'area_upgrades_count',
      ...flattenedHeaders,
      'upgrade_interests_flat',
      'document_uploads_count',
      'document_uploads_refs',
      'area_upgrades_raw_json',
      'upgrade_interests_raw_json',
      'document_uploads_raw_json',
      'floor_plan_annotations_raw_json',
    ];

    const rows = filtered.map((s) => {
      const flatAreas = flattenAreaUpgrades(s.area_upgrades, maxAreaUpgrades);
      const docCount = Array.isArray(s.document_uploads) ? (s.document_uploads as unknown[]).length : 0;

      const baseRow = baseColumns.map((c) => {
        const v = s[c];
        // Render dates as ISO; arrays/objects handled separately so leave others raw
        return v;
      });

      return [
        ...baseRow,
        Array.isArray(s.area_upgrades) ? (s.area_upgrades as unknown[]).length : 0,
        ...flattenedHeaders.map((h) => flatAreas[h] ?? ''),
        flattenUpgradeInterests(s.upgrade_interests),
        docCount,
        flattenDocumentUploads(s.document_uploads),
        s.area_upgrades,
        s.upgrade_interests,
        s.document_uploads,
        s.floor_plan_annotations,
      ];
    });

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n');

    downloadBlob(
      csv,
      `submissions-full-export-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      'text/csv',
    );
    setGenerating(null);
    toast.success(`Exported ${filtered.length} submissions (${headers.length} columns)`);
  };

  const exportPdfBundle = async () => {
    if (filtered.length === 0) {
      toast.error('No submissions match the current filters');
      return;
    }
    setGenerating('pdf-bundle');
    try {
      // Generate one PDF per submission sequentially (browser download)
      for (const s of filtered) {
        await generateSubmissionPDF(s as any);
        // small delay so browser handles successive downloads
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
    startDate, endDate,
    unitType !== 'all' ? unitType : null,
    status !== 'all' ? status : null,
    emailQuery.trim() ? emailQuery : null,
  ].filter(Boolean).length;

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">Export Submissions</h1>
            <p className="text-muted-foreground mt-1">Filter submissions and export as CSV or PDF</p>
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
            {/* Start date */}
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

            {/* End date */}
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

            {/* Unit type */}
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

            {/* Status */}
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

            {/* Email */}
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

        {/* Export actions */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="p-6 rounded-xl border border-border bg-card flex flex-col">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-3 rounded-lg bg-primary/10">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Summary CSV</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Core fields only — buyer info, key material picks, window totals, status.
                </p>
              </div>
            </div>
            <Button
              onClick={exportSummaryCsv}
              disabled={loading || generating !== null || filtered.length === 0}
              className="gap-2 w-full"
              variant="outline"
            >
              <Download className="w-4 h-4" />
              {generating === 'summary-csv' ? 'Generating…' : 'Download CSV'}
            </Button>
          </div>

          <div className="p-6 rounded-xl border border-primary/30 bg-primary/5 flex flex-col">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-3 rounded-lg bg-primary/20">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-1">Full Export (All Fields) CSV</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Every column from buyer_selections, plus flattened area upgrades, all comment channels,
                  upgrade interests, and document upload references.
                </p>
              </div>
            </div>
            <Button
              onClick={exportFullCsv}
              disabled={loading || generating !== null || filtered.length === 0}
              className="gap-2 w-full"
            >
              <Download className="w-4 h-4" />
              {generating === 'full-csv' ? 'Generating…' : 'Download Full CSV'}
            </Button>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card flex flex-col">
            <div className="flex items-start gap-4 flex-1">
              <div className="p-3 rounded-lg bg-accent/20">
                <FileText className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-lg font-semibold text-foreground mb-1">PDF Bundle</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Generates one PDF per matching submission using the standard admin template.
                </p>
              </div>
            </div>
            <Button
              onClick={exportPdfBundle}
              disabled={loading || generating !== null || filtered.length === 0}
              className="gap-2 w-full"
              variant="outline"
            >
              <Download className="w-4 h-4" />
              {generating === 'pdf-bundle' ? `Generating ${filtered.length}…` : `Download ${filtered.length} PDF${filtered.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>

        {/* Preview list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-medium text-foreground">Matching submissions</h3>
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
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((s) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 50 && (
                <div className="p-3 text-xs text-muted-foreground text-center border-t border-border">
                  Showing first 50 of {filtered.length}. All matching rows will be included in the export.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
