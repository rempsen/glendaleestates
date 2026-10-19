// =====================================================================
// DownstreamTrackingPanel
// Admin editor surface for the new submission_payments,
// submission_ownership, and submission_line_items tables.
// Renders inside SubmissionEditor.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { DollarSign, Users, Package, Save } from 'lucide-react';
import {
  APPROVAL_STATUSES, INSTALLATION_STATUSES, RISK_LEVELS, PAYMENT_STATUSES,
  buildCanonicalLines,
} from '@/lib/submissionLineItems';
import {
  type SubmissionPaymentRow,
  type SubmissionOwnershipRow,
  type SubmissionLineItemRow,
} from '@/lib/fetchDownstreamData';
import { computeUpgradeTotals } from '@/lib/upgradeTotals';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { useUnitAreaData } from '@/hooks/useUnitAreaData';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';

interface Props {
  submissionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submission: any;
}

const emptyPay = (id: string): SubmissionPaymentRow => ({
  submission_id: id,
  deposit_required: false,
  deposit_amount: 0,
  deposit_paid: false,
  deposit_paid_date: null,
  balance_owing: 0,
  invoice_number: null,
  payment_status: 'unbilled',
  notes: null,
});
const emptyOwn = (id: string): SubmissionOwnershipRow => ({
  submission_id: id,
  designer_assigned: null,
  sales_rep: null,
  next_action: null,
  next_action_owner: null,
  due_date: null,
  risk_level: 'green',
  notes: null,
});

export function DownstreamTrackingPanel({ submissionId, submission }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pay, setPay] = useState<SubmissionPaymentRow>(emptyPay(submissionId));
  const [own, setOwn] = useState<SubmissionOwnershipRow>(emptyOwn(submissionId));
  const [lines, setLines] = useState<Record<string, Partial<SubmissionLineItemRow>>>({});

  // pricing for canonical line synthesis
  const pricing = useDynamicPricing();
  const { unitAreaData } = useUnitAreaData();

  const canonicalLines = useMemo(() => {
    if (!pricing.loaded) return [];
    const totals = computeUpgradeTotals(
      {
        unitTypeCode: submission.unit_type ? normalizeUnitTypeCode(submission.unit_type) : null,
        upgradeFloorSelection: submission.upgrade_floor_selection || null,
        areaUpgrades: submission.area_upgrades || [],
        backsplashGrout: submission.backsplash_grout_enabled
          ? { enabled: true, groutColor: submission.backsplash_grout_color || '', comments: '' }
          : null,
        stairLvpUpgradeSelected: !!submission.stair_lvp_upgrade_selected,
        stairUpgradeType: (submission as any).stair_upgrade_type || null,
        stairPremiumCarpetSelected: !!(submission as any).stair_premium_carpet_selected,
        additionalWindowsQty: submission.additional_windows_qty || 0,
        patioDoorsQty: submission.patio_doors_qty || 0,
        automatedWindowsQty: submission.automated_windows_qty || 0,
        bathroomTileSelected: !!submission.bathroom_tile_selected,
        bathroomTileEnsuiteSelected: submission.bathroom_tile_ensuite_selected,
        bathroomTileGuestSelected: submission.bathroom_tile_guest_selected,
        heatedFloorBathrooms: submission.heated_floor_bathrooms || 0,
        customTiledShower: !!submission.custom_tiled_shower,
      },
      {
        markupPercentage: pricing.markupPercentage,
        gstRate: pricing.gstRate,
        getMaterialCost: pricing.getMaterialCost,
        getGroutColorFee: () => pricing.getGroutColorChangePrice(),
        getAdditionalWindowPrice: () => pricing.getAdditionalWindowPrice(),
        getPatioDoorPrice: () => pricing.getPatioDoorPrice(),
        getAutomatedMotorPrice: () => pricing.getAutomatedMotorPrice(),
        getHeatedFloorPrice: () => pricing.getHeatedFloorPrice(),
        getStairLvpUpgradePrice: () => pricing.getStairLvpUpgradePrice(),
        getStairCarpetUpgradePrice: () => pricing.getStairCarpetUpgradePrice(),
        getUnitAreaData: (code: string) => {
          const row = unitAreaData.find((u) => u.unit_type_code?.toUpperCase() === code?.toUpperCase());
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
      },
    );
    return buildCanonicalLines(submission, totals);
  }, [submission, pricing, unitAreaData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [p, o, li] = await Promise.all([
        supabase.from('submission_payments').select('*').eq('submission_id', submissionId).maybeSingle(),
        supabase.from('submission_ownership').select('*').eq('submission_id', submissionId).maybeSingle(),
        supabase.from('submission_line_items').select('*').eq('submission_id', submissionId),
      ]);
      if (cancelled) return;
      if (p.data) setPay(p.data as SubmissionPaymentRow);
      if (o.data) setOwn(o.data as SubmissionOwnershipRow);
      const map: Record<string, Partial<SubmissionLineItemRow>> = {};
      (li.data || []).forEach((r) => { map[(r as SubmissionLineItemRow).line_key] = r as SubmissionLineItemRow; });
      setLines(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [submissionId]);

  const updateLine = (key: string, label: string, patch: Partial<SubmissionLineItemRow>) => {
    setLines((prev) => ({
      ...prev,
      [key]: { line_key: key, line_label: label, ...prev[key], ...patch },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error: pe } = await supabase
        .from('submission_payments')
        .upsert({ ...pay, submission_id: submissionId }, { onConflict: 'submission_id' });
      if (pe) throw pe;
      const { error: oe } = await supabase
        .from('submission_ownership')
        .upsert({ ...own, submission_id: submissionId }, { onConflict: 'submission_id' });
      if (oe) throw oe;

      const rows = Object.values(lines)
        .filter((l) => l.line_key)
        .map((l) => ({
          submission_id: submissionId,
          line_key: l.line_key!,
          line_label: l.line_label ?? null,
          approval_status: l.approval_status ?? 'pending_client_confirmation',
          supplier: l.supplier ?? null,
          sku: l.sku ?? null,
          quantity_required: l.quantity_required ?? null,
          quantity_ordered: l.quantity_ordered ?? null,
          po_number: l.po_number ?? null,
          order_date: l.order_date ?? null,
          expected_delivery: l.expected_delivery ?? null,
          received_date: l.received_date ?? null,
          storage_location: l.storage_location ?? null,
          installation_status: l.installation_status ?? 'not_started',
          risk_level: l.risk_level ?? 'green',
          notes: l.notes ?? null,
        }));
      if (rows.length > 0) {
        const { error: le } = await supabase
          .from('submission_line_items')
          .upsert(rows, { onConflict: 'submission_id,line_key' });
        if (le) throw le;
      }
      toast.success('Downstream tracking saved');
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error('Failed to save', { description: (e as any).message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground p-4">Loading downstream data…</div>;

  return (
    <div className="space-y-4">
      <Accordion type="multiple" className="space-y-2">
        {/* Payments / AR */}
        <AccordionItem value="payments" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2"><DollarSign className="w-4 h-4" /> Payments / AR</div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 col-span-2">
              <Switch checked={pay.deposit_required}
                onCheckedChange={(v) => setPay({ ...pay, deposit_required: v })} />
              <Label>Deposit Required</Label>
            </div>
            <div><Label>Deposit Amount</Label>
              <Input type="number" value={pay.deposit_amount}
                onChange={(e) => setPay({ ...pay, deposit_amount: Number(e.target.value) || 0 })} />
            </div>
            <div><Label>Balance Owing</Label>
              <Input type="number" value={pay.balance_owing}
                onChange={(e) => setPay({ ...pay, balance_owing: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={pay.deposit_paid}
                onCheckedChange={(v) => setPay({ ...pay, deposit_paid: v })} />
              <Label>Deposit Paid</Label>
            </div>
            <div><Label>Deposit Paid Date</Label>
              <Input type="date" value={pay.deposit_paid_date ?? ''}
                onChange={(e) => setPay({ ...pay, deposit_paid_date: e.target.value || null })} />
            </div>
            <div><Label>Invoice #</Label>
              <Input value={pay.invoice_number ?? ''}
                onChange={(e) => setPay({ ...pay, invoice_number: e.target.value || null })} />
            </div>
            <div><Label>Payment Status</Label>
              <Select value={pay.payment_status} onValueChange={(v) => setPay({ ...pay, payment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Notes</Label>
              <Textarea rows={2} value={pay.notes ?? ''}
                onChange={(e) => setPay({ ...pay, notes: e.target.value || null })} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Ownership / RACI */}
        <AccordionItem value="ownership" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /> Ownership / RACI</div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6 grid grid-cols-2 gap-3">
            <div><Label>Designer Assigned</Label>
              <Input value={own.designer_assigned ?? ''}
                onChange={(e) => setOwn({ ...own, designer_assigned: e.target.value || null })} />
            </div>
            <div><Label>Sales Rep</Label>
              <Input value={own.sales_rep ?? ''}
                onChange={(e) => setOwn({ ...own, sales_rep: e.target.value || null })} />
            </div>
            <div className="col-span-2"><Label>Next Action</Label>
              <Input value={own.next_action ?? ''}
                onChange={(e) => setOwn({ ...own, next_action: e.target.value || null })} />
            </div>
            <div><Label>Next Action Owner</Label>
              <Input value={own.next_action_owner ?? ''}
                onChange={(e) => setOwn({ ...own, next_action_owner: e.target.value || null })} />
            </div>
            <div><Label>Due Date</Label>
              <Input type="date" value={own.due_date ?? ''}
                onChange={(e) => setOwn({ ...own, due_date: e.target.value || null })} />
            </div>
            <div><Label>Risk Level</Label>
              <Select value={own.risk_level} onValueChange={(v) => setOwn({ ...own, risk_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Notes</Label>
              <Textarea rows={2} value={own.notes ?? ''}
                onChange={(e) => setOwn({ ...own, notes: e.target.value || null })} />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Line Items */}
        <AccordionItem value="lines" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2"><Package className="w-4 h-4" /> Line Item Approval & Procurement
              <span className="text-xs text-muted-foreground ml-2">{canonicalLines.length} lines</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4 pb-6 space-y-3">
            {canonicalLines.length === 0 && (
              <p className="text-sm text-muted-foreground">No upgrade line items on this submission.</p>
            )}
            {canonicalLines.map((cl) => {
              const cur = lines[cl.line_key] || {};
              return (
                <div key={cl.line_key} className="border rounded-lg p-3 space-y-2 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{cl.line_label}</div>
                    <div className="text-xs text-muted-foreground">${cl.amount.toFixed(2)}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Approval</Label>
                      <Select
                        value={cur.approval_status ?? 'pending_client_confirmation'}
                        onValueChange={(v) => updateLine(cl.line_key, cl.line_label, { approval_status: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {APPROVAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Supplier</Label>
                      <Input value={cur.supplier ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { supplier: e.target.value })} />
                    </div>
                    <div><Label className="text-xs">SKU</Label>
                      <Input value={cur.sku ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { sku: e.target.value })} />
                    </div>
                    <div><Label className="text-xs">Qty Required</Label>
                      <Input type="number" value={cur.quantity_required ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { quantity_required: e.target.value === '' ? null : Number(e.target.value) })} />
                    </div>
                    <div><Label className="text-xs">Qty Ordered</Label>
                      <Input type="number" value={cur.quantity_ordered ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { quantity_ordered: e.target.value === '' ? null : Number(e.target.value) })} />
                    </div>
                    <div><Label className="text-xs">PO #</Label>
                      <Input value={cur.po_number ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { po_number: e.target.value })} />
                    </div>
                    <div><Label className="text-xs">Order Date</Label>
                      <Input type="date" value={cur.order_date ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { order_date: e.target.value || null })} />
                    </div>
                    <div><Label className="text-xs">Expected Delivery</Label>
                      <Input type="date" value={cur.expected_delivery ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { expected_delivery: e.target.value || null })} />
                    </div>
                    <div><Label className="text-xs">Received Date</Label>
                      <Input type="date" value={cur.received_date ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { received_date: e.target.value || null })} />
                    </div>
                    <div><Label className="text-xs">Storage Location</Label>
                      <Input value={cur.storage_location ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { storage_location: e.target.value })} />
                    </div>
                    <div><Label className="text-xs">Installation Status</Label>
                      <Select
                        value={cur.installation_status ?? 'not_started'}
                        onValueChange={(v) => updateLine(cl.line_key, cl.line_label, { installation_status: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {INSTALLATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label className="text-xs">Risk</Label>
                      <Select
                        value={cur.risk_level ?? 'green'}
                        onValueChange={(v) => updateLine(cl.line_key, cl.line_label, { risk_level: v })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RISK_LEVELS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 md:col-span-3"><Label className="text-xs">Notes</Label>
                      <Input value={cur.notes ?? ''}
                        onChange={(e) => updateLine(cl.line_key, cl.line_label, { notes: e.target.value })} />
                    </div>
                  </div>
                </div>
              );
            })}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Downstream Tracking'}
        </Button>
      </div>
    </div>
  );
}
