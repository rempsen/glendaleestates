// =====================================================================
// AdminProjectManagement
// Three views: Per-Unit | Line Items | Master Aggregate
// All edits write to submission_payments / submission_line_items.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, RefreshCw, Truck, ListChecks, LayoutGrid, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { SuppliersManager } from '@/components/admin/SuppliersManager';
import {
  loadProjectManagementData, type PMData, type PMLineRow,
} from '@/lib/projectManagementData';
import { INSTALLATION_STATUSES, PAYMENT_STATUSES } from '@/lib/submissionLineItems';

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0);

export default function AdminProjectManagement() {
  const [data, setData] = useState<PMData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMaterial, setFilterMaterial] = useState<string>('all');
  const [filterColor, setFilterColor] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [linesUnit, setLinesUnit] = useState<string>('all');
  const [sortKey, setSortKey] = useState<'material_key' | 'color_name' | 'area_type' | 'total_qty' | 'ordered_qty' | 'pct' | 'units' | 'suppliers'>('material_key');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadProjectManagementData());
    } catch (e) {
      toast.error('Failed to load', { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // ---------- patches ----------
  const patchPayment = async (submissionId: string, patch: Record<string, unknown>) => {
    setSavingKey('pay:' + submissionId);
    const { error } = await supabase
      .from('submission_payments')
      .upsert({ submission_id: submissionId, ...patch }, { onConflict: 'submission_id' });
    setSavingKey(null);
    if (error) return toast.error(error.message);
    await refresh();
  };

  const patchLine = async (line: PMLineRow, patch: Partial<PMLineRow>) => {
    setSavingKey(line.submission_id + ':' + line.line_key);
    const { error } = await supabase.from('submission_line_items').upsert(
      {
        submission_id: line.submission_id,
        line_key: line.line_key,
        line_label: line.line_label,
        approval_status: line.approval_status,
        installation_status: line.installation_status,
        supplier: line.supplier,
        sku: line.sku,
        quantity_required: line.quantity_required,
        quantity_ordered: line.quantity_ordered,
        po_number: line.po_number,
        order_date: line.order_date,
        expected_delivery: line.expected_delivery,
        received_date: line.received_date,
        storage_location: line.storage_location,
        notes: line.notes,
        area_type: line.area_type,
        material_key: line.material_key,
        color_name: line.color_name,
        unit_of_measure: line.unit_of_measure,
        ...patch,
      },
      { onConflict: 'submission_id,line_key' },
    );
    setSavingKey(null);
    if (error) return toast.error(error.message);
    await refresh();
  };

  // ---------- filtering ----------
  const filteredLines = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.lines.filter((l) => {
      if (filterMaterial !== 'all' && (l.material_key || 'unknown') !== filterMaterial) return false;
      if (filterColor !== 'all' && (l.color_name || '—') !== filterColor) return false;
      if (filterSupplier !== 'all' && (l.supplier || '') !== filterSupplier) return false;
      if (!q) return true;
      return [l.unit_number, l.full_name, l.line_label, l.supplier, l.po_number, l.color_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, search, filterMaterial, filterColor, filterSupplier]);

  const filteredUnits = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.units;
    return data.units.filter((u) =>
      [u.unit_number, u.full_name, u.unit_type, u.invoice_number]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);

  const filteredAgg = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const rows = data.aggregates.filter((a) => {
      if (filterMaterial !== 'all' && a.material_key !== filterMaterial) return false;
      if (filterColor !== 'all' && a.color_name !== filterColor) return false;
      if (filterSupplier !== 'all' && !a.suppliers.includes(filterSupplier)) return false;
      if (!q) return true;
      return [a.material_key, a.color_name, a.area_type].some((v) => v.toLowerCase().includes(q));
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const get = (a: typeof rows[number]) => {
      switch (sortKey) {
        case 'pct': return a.total_qty > 0 ? a.ordered_qty / a.total_qty : 0;
        case 'units': return a.units.length;
        case 'suppliers': return a.suppliers.join(',');
        case 'total_qty': return a.total_qty;
        case 'ordered_qty': return a.ordered_qty;
        default: return a[sortKey];
      }
    };
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, search, filterMaterial, filterColor, filterSupplier, sortKey, sortDir]);

  const materialOptions = useMemo(
    () => Array.from(new Set((data?.lines || []).map((l) => l.material_key || 'unknown'))).sort(),
    [data],
  );
  const colorOptions = useMemo(
    () => Array.from(new Set((data?.lines || []).map((l) => l.color_name || '—'))).sort(),
    [data],
  );
  const supplierOptions = useMemo(
    () => (data?.suppliers || []).map((s) => s.name),
    [data],
  );

  // ---------- KPIs ----------
  const kpis = useMemo(() => {
    if (!data) return { total: 0, paid: 0, owing: 0, lines: 0, ordered: 0 };
    return data.units.reduce(
      (acc, u) => ({
        total: acc.total + u.grand_total,
        paid: acc.paid + u.payments_to_date,
        owing: acc.owing + u.balance_owing,
        lines: acc.lines + u.lines_total,
        ordered: acc.ordered + u.lines_ordered,
      }),
      { total: 0, paid: 0, owing: 0, lines: 0, ordered: 0 },
    );
  }, [data]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Project Management</h1>
            <p className="text-sm text-muted-foreground">Track payments, procurement, and aggregated material orders.</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Total Contract Value" value={fmt$(kpis.total)} />
          <Kpi label="Payments Received" value={fmt$(kpis.paid)} />
          <Kpi label="Balance Owing" value={fmt$(kpis.owing)} />
          <Kpi label="Total Line Items" value={String(kpis.lines)} />
          <Kpi label="Ordered" value={`${kpis.ordered} / ${kpis.lines}`} />
        </div>

        {/* Filters */}
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search unit, name, material, PO…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <FilterSelect label="Material" value={filterMaterial} setValue={setFilterMaterial} options={materialOptions} />
          <FilterSelect label="Color" value={filterColor} setValue={setFilterColor} options={colorOptions} />
          <FilterSelect label="Supplier" value={filterSupplier} setValue={setFilterSupplier} options={supplierOptions} />
        </Card>

        <Tabs defaultValue="units">
          <TabsList>
            <TabsTrigger value="units" className="gap-2"><LayoutGrid className="w-4 h-4" /> Per-Unit</TabsTrigger>
            <TabsTrigger value="lines" className="gap-2"><ListChecks className="w-4 h-4" /> Line Items Per Unit</TabsTrigger>
            <TabsTrigger value="aggregate" className="gap-2"><Truck className="w-4 h-4" /> Master Aggregate</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          </TabsList>

          {/* ---------------- PER UNIT ---------------- */}
          <TabsContent value="units" className="mt-4">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Deposit $</TableHead>
                    <TableHead>Deposit Paid</TableHead>
                    <TableHead>Paid Date</TableHead>
                    <TableHead className="text-right">Paid To Date</TableHead>
                    <TableHead className="text-right">Balance Paid</TableHead>
                    <TableHead>Balance Paid Date</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>
                      Invoice Number
                      <div className="text-[10px] font-normal text-muted-foreground">separate by comma or Enter</div>
                    </TableHead>
                    <TableHead>Procurement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnits.map((u) => (
                    <TableRow key={u.submission_id}>
                      <TableCell className="font-medium">{u.unit_number}</TableCell>
                      <TableCell>{u.full_name}</TableCell>
                      <TableCell>{u.unit_type || '—'}</TableCell>
                      <TableCell className="text-right">{fmt$(u.grand_total)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" className="h-8 w-24 text-right"
                          defaultValue={u.deposit_amount}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v !== u.deposit_amount) patchPayment(u.submission_id, { deposit_amount: v, deposit_required: true });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Select value={u.deposit_paid ? 'yes' : 'no'} onValueChange={(v) => patchPayment(u.submission_id, { deposit_paid: v === 'yes' })}>
                          <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date" className="h-8 w-36"
                          defaultValue={u.deposit_paid_date ?? ''}
                          onBlur={(e) => patchPayment(u.submission_id, { deposit_paid_date: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell className="text-right">{fmt$(u.payments_to_date)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" className="h-8 w-24 text-right"
                          defaultValue={u.balance_paid || ''}
                          onBlur={(e) => {
                            const v = Number(e.target.value) || 0;
                            if (v !== u.balance_paid) patchPayment(u.submission_id, { balance_paid: v });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date" className="h-8 w-36"
                          defaultValue={u.balance_paid_date ?? ''}
                          onBlur={(e) => patchPayment(u.submission_id, { balance_paid_date: e.target.value || null })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">{fmt$(u.balance_owing)}</TableCell>
                      <TableCell>
                        <Select value={u.payment_status} onValueChange={(v) => patchPayment(u.submission_id, { payment_status: v })}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-40" defaultValue={u.invoice_number ?? ''}
                          placeholder="INV-001, INV-002"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const el = e.currentTarget;
                              const v = el.value.trim();
                              if (v && !v.endsWith(',')) el.value = v + ', ';
                            }
                          }}
                          onBlur={(e) => {
                            const cleaned = e.target.value
                              .split(',').map((s) => s.trim()).filter(Boolean).join(', ');
                            if (cleaned !== (u.invoice_number ?? '')) {
                              patchPayment(u.submission_id, { invoice_number: cleaned || null });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <ProgressDots total={u.lines_total} ordered={u.lines_ordered} received={u.lines_received} installed={u.lines_installed} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* ---------------- LINE ITEMS ---------------- */}
          <TabsContent value="lines" className="mt-4">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead className="text-right">Qty Req</TableHead>
                    <TableHead className="text-right">Qty Ord</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PO #</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLines.map((l) => {
                    const id = l.submission_id + ':' + l.line_key;
                    const isSaving = savingKey === id;
                    return (
                      <TableRow key={id} className={isSaving ? 'opacity-60' : ''}>
                        <TableCell className="font-medium whitespace-nowrap">{l.unit_number}</TableCell>
                        <TableCell className="whitespace-nowrap">{l.line_label}</TableCell>
                        <TableCell className="whitespace-nowrap">{l.material_key || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{l.color_name || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{l.area_type || '—'}</TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className="h-8 w-20 text-right" defaultValue={l.quantity_required ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value === '' ? null : Number(e.target.value);
                              if (v !== l.quantity_required) patchLine(l, { quantity_required: v });
                            }} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className="h-8 w-20 text-right" defaultValue={l.quantity_ordered ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value === '' ? null : Number(e.target.value);
                              if (v !== l.quantity_ordered) patchLine(l, { quantity_ordered: v });
                            }} />
                        </TableCell>
                        <TableCell>
                          <Select value={l.supplier ?? '__none'} onValueChange={(v) => patchLine(l, { supplier: v === '__none' ? null : v })}>
                            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Supplier" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">— None —</SelectItem>
                              {supplierOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={l.installation_status} onValueChange={(v) => patchLine(l, { installation_status: v })}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {INSTALLATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 w-24" defaultValue={l.po_number ?? ''}
                            onBlur={(e) => patchLine(l, { po_number: e.target.value || null })} />
                        </TableCell>
                        <TableCell>
                          <Input type="date" className="h-8 w-36" defaultValue={l.order_date ?? ''}
                            onBlur={(e) => patchLine(l, { order_date: e.target.value || null })} />
                        </TableCell>
                        <TableCell>
                          <Input type="date" className="h-8 w-36" defaultValue={l.expected_delivery ?? ''}
                            onBlur={(e) => patchLine(l, { expected_delivery: e.target.value || null })} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmt$(l.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* ---------------- AGGREGATE ---------------- */}
          <TabsContent value="aggregate" className="mt-4">
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead label="Material" k="material_key" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHead label="Color" k="color_name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHead label="Area" k="area_type" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHead label="Total Qty" k="total_qty" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <SortHead label="Ordered" k="ordered_qty" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                    <TableHead>UoM</TableHead>
                    <SortHead label="Suppliers" k="suppliers" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <SortHead label="Units" k="units" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgg.map((a) => {
                    const pct = a.total_qty > 0 ? Math.round((a.ordered_qty / a.total_qty) * 100) : 0;
                    return (
                      <TableRow key={a.key}>
                        <TableCell className="font-medium">{a.material_key}</TableCell>
                        <TableCell>{a.color_name}</TableCell>
                        <TableCell>{a.area_type}</TableCell>
                        <TableCell className="text-right">{a.total_qty.toFixed(0)}</TableCell>
                        <TableCell className="text-right">{a.ordered_qty.toFixed(0)} <span className="text-xs text-muted-foreground">({pct}%)</span></TableCell>
                        <TableCell>{a.unit_of_measure}</TableCell>
                        <TableCell>{a.suppliers.length ? a.suppliers.join(', ') : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell><Badge variant="outline">{a.units.length}</Badge></TableCell>
                        <TableCell className="text-xs">
                          <span className="text-muted-foreground">NS</span> {a.status_summary.not_started} · <span className="text-amber-600">Ord</span> {a.status_summary.ordered} · <span className="text-blue-600">Rec</span> {a.status_summary.received} · <span className="text-emerald-600">Inst</span> {a.status_summary.installed}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers" className="mt-4">
            <SuppliersManager onChange={refresh} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </Card>
  );
}

function FilterSelect({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: string[] }) {
  return (
    <Select value={value} onValueChange={setValue}>
      <SelectTrigger className="h-9 w-40"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}s</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ProgressDots({ total, ordered, received, installed }: { total: number; ordered: number; received: number; installed: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="text-xs whitespace-nowrap">
      <span className="text-muted-foreground">{total}</span> ·
      <span className="text-amber-600 ml-1">Ord {ordered}</span> ·
      <span className="text-blue-600 ml-1">Rec {received}</span> ·
      <span className="text-emerald-600 ml-1">Inst {installed}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SortHead({ label, k, sortKey, sortDir, onClick, align }: { label: string; k: any; sortKey: string; sortDir: 'asc' | 'desc'; onClick: (k: any) => void; align?: 'right' }) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? 'text-foreground' : ''}`}>
        {label} <Icon className="w-3 h-3" />
      </button>
    </TableHead>
  );
}
