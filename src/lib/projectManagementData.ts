// =====================================================================
// Loads everything the Project Management page needs:
//   - All buyer_selections
//   - submission_payments / ownership / line_items
//   - pricing + unit areas (so we can synthesise canonical lines for any
//     submission that hasn't been opened in the editor yet)
// Returns three derived shapes: per-unit rows, line-item rows, aggregate rows.
// =====================================================================

import { supabase } from '@/integrations/supabase/client';
import { computeUpgradeTotals } from '@/lib/upgradeTotals';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';
import { buildCanonicalLines, type CanonicalLine } from '@/lib/submissionLineItems';
import type {
  SubmissionPaymentRow, SubmissionLineItemRow,
} from '@/lib/fetchDownstreamData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Submission = any;

export interface PMUnitRow {
  submission_id: string;
  unit_number: string;
  full_name: string;
  unit_type: string | null;
  status: string;
  grand_total: number;
  deposit_required: boolean;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  balance_paid: number;
  balance_paid_date: string | null;
  payments_to_date: number;
  balance_owing: number;
  payment_status: string;
  invoice_number: string | null;
  lines_total: number;
  lines_ordered: number;
  lines_received: number;
  lines_installed: number;
}

export interface PMLineRow {
  submission_id: string;
  unit_number: string;
  full_name: string;
  line_key: string;
  line_label: string;
  amount: number;
  area_type: string | null;
  material_key: string | null;
  color_name: string | null;
  quantity_required: number | null;
  canonical_quantity: number;
  unit_of_measure: string;
  canonical_unit_of_measure: string;
  canonical_area_type: string | null;
  tracked_unit_of_measure: string | null;
  tracked_area_type: string | null;
  // tracking
  approval_status: string;
  installation_status: string;
  supplier: string | null;
  sku: string | null;
  quantity_ordered: number | null;
  po_number: string | null;
  order_date: string | null;
  expected_delivery: string | null;
  received_date: string | null;
  storage_location: string | null;
  notes: string | null;
}

export interface PMAggregateRow {
  key: string;
  material_key: string;
  color_name: string;
  area_type: string;
  total_qty: number;
  ordered_qty: number;
  unit_of_measure: string;
  suppliers: string[];
  units: string[];
  status_summary: { not_started: number; ordered: number; received: number; installed: number };
}

export interface PMData {
  units: PMUnitRow[];
  lines: PMLineRow[];
  aggregates: PMAggregateRow[];
  suppliers: { id: string; name: string }[];
}

const num = (v: unknown) => Number(v) || 0;

export async function loadProjectManagementData(): Promise<PMData> {
  const [subRes, payRes, lineRes, supRes, pricingRes, areasRes, matRes] = await Promise.all([
    supabase.from('buyer_selections').select('*').order('unit_number'),
    supabase.from('submission_payments').select('*'),
    supabase.from('submission_line_items').select('*'),
    supabase.from('suppliers').select('id,name').eq('is_active', true).order('name'),
    supabase.from('pricing_config').select('*').eq('is_active', true),
    supabase.from('unit_area_data').select('*'),
    supabase.from('upgrade_materials').select('material_key,cost_per_unit').eq('is_active', true),
  ]);

  const submissions = (subRes.data || []) as Submission[];
  const payments = new Map<string, SubmissionPaymentRow>();
  (payRes.data || []).forEach((r) => payments.set(r.submission_id, r as SubmissionPaymentRow));
  const linesBySub = new Map<string, Map<string, SubmissionLineItemRow>>();
  (lineRes.data || []).forEach((r) => {
    const row = r as SubmissionLineItemRow;
    if (!linesBySub.has(row.submission_id)) linesBySub.set(row.submission_id, new Map());
    linesBySub.get(row.submission_id)!.set(row.line_key, row);
  });

  // ---------- pricing helpers (mirror useDynamicPricing) ----------
  const cfg: Record<string, number> = {};
  (pricingRes.data || []).forEach((r) => { cfg[r.config_key] = num(r.config_value); });
  const matCostMap: Record<string, number> = {};
  (matRes.data || []).forEach((r: { material_key: string; cost_per_unit: number }) => {
    matCostMap[r.material_key] = num(r.cost_per_unit);
  });
  const pricing = {
    markupPercentage: (cfg.markup_percentage ?? 60) / 100,
    gstRate: (cfg.gst_rate ?? 5) / 100,
    getMaterialCost: (m: string) => matCostMap[m] ?? 0,
    getGroutColorFee: () => cfg.grout_color_change_price ?? 0,
    getAdditionalWindowPrice: () => cfg.additional_window_price ?? 0,
    getPatioDoorPrice: () => cfg.patio_door_price ?? 0,
    getAutomatedMotorPrice: () => cfg.automated_motor_price ?? 0,
    getHeatedFloorPrice: () => cfg.heated_floor_per_bathroom ?? 0,
    getStairLvpUpgradePrice: () => cfg.stair_lvp_upgrade_price ?? 0,
    getStairPremiumLvpUpgradePrice: () => cfg.stair_premium_lvp_upgrade_price ?? 0,
    getStairCarpetUpgradePrice: () => cfg.premium_carpet_stairs_price ?? 0,
    getUnitAreaData: (code: string) => {
      const row = (areasRes.data || []).find((u) => u.unit_type_code?.toUpperCase() === code?.toUpperCase());
      if (!row) return null;
      return {
        allLvp: num(row.all_lvp), mainLiving: num(row.main_living),
        secondBedroom: num(row.second_bedroom),
        masterBedroomLvp: num((row as { master_bedroom_lvp?: number }).master_bedroom_lvp),
        masterBedroom: num(row.master_bedroom),
        secondBedroomCarpet: num(row.second_bedroom_carpet),
        guestBathroom: num(row.guest_bathroom),
        masterEnsuite: num(row.master_ensuite),
        laundry: num(row.laundry), backsplash: num(row.backsplash),
      };
    },
  };

  const units: PMUnitRow[] = [];
  const lines: PMLineRow[] = [];

  for (const s of submissions) {
    const totals = computeUpgradeTotals(
      {
        unitTypeCode: s.unit_type ? normalizeUnitTypeCode(s.unit_type) : null,
        upgradeFloorSelection: s.upgrade_floor_selection || null,
        areaUpgrades: s.area_upgrades || [],
        backsplashGrout: s.backsplash_grout_enabled
          ? { enabled: true, groutColor: s.backsplash_grout_color || '', comments: '' }
          : null,
        stairLvpUpgradeSelected: !!s.stair_lvp_upgrade_selected,
        stairUpgradeType: s.stair_upgrade_type || null,
        stairPremiumCarpetSelected: !!s.stair_premium_carpet_selected,
        additionalWindowsQty: s.additional_windows_qty || 0,
        patioDoorsQty: s.patio_doors_qty || 0,
        automatedWindowsQty: s.automated_windows_qty || 0,
        bathroomTileSelected: !!s.bathroom_tile_selected,
        bathroomTileEnsuiteSelected: s.bathroom_tile_ensuite_selected,
        bathroomTileGuestSelected: s.bathroom_tile_guest_selected,
        heatedFloorBathrooms: s.heated_floor_bathrooms || 0,
        customTiledShower: !!s.custom_tiled_shower,
        customPricing: (s as any).custom_pricing,
      },
      pricing,
    );
    const canonical: CanonicalLine[] = buildCanonicalLines(s, totals);
    const subLines = linesBySub.get(s.id) || new Map();

    let nOrdered = 0, nReceived = 0, nInstalled = 0;
    canonical.forEach((cl) => {
      const tracked = subLines.get(cl.line_key);
      const status = tracked?.installation_status || 'not_started';
      if (status === 'ordered' || status === 'received' || status === 'installed' || status === 'staged') nOrdered++;
      if (status === 'received' || status === 'staged' || status === 'installed') nReceived++;
      if (status === 'installed') nInstalled++;
      lines.push({
        submission_id: s.id,
        unit_number: s.unit_number,
        full_name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
        line_key: cl.line_key,
        line_label: cl.line_label,
        amount: cl.amount,
        area_type: cl.area_type,
        material_key: cl.material_key,
        color_name: cl.color_name,
        quantity_required: tracked?.quantity_required ?? cl.quantity,
        canonical_quantity: cl.quantity,
        unit_of_measure: tracked?.unit_of_measure ?? cl.unit_of_measure,
        canonical_unit_of_measure: cl.unit_of_measure,
        canonical_area_type: cl.area_type,
        tracked_unit_of_measure: tracked?.unit_of_measure ?? null,
        tracked_area_type: tracked?.area_type ?? null,
        approval_status: tracked?.approval_status ?? 'pending_client_confirmation',
        installation_status: status,
        supplier: tracked?.supplier ?? null,
        sku: tracked?.sku ?? null,
        quantity_ordered: tracked?.quantity_ordered ?? null,
        po_number: tracked?.po_number ?? null,
        order_date: tracked?.order_date ?? null,
        expected_delivery: tracked?.expected_delivery ?? null,
        received_date: tracked?.received_date ?? null,
        storage_location: tracked?.storage_location ?? null,
        notes: tracked?.notes ?? null,
      });
    });

    const pay = payments.get(s.id);
    const depositPaidAmt = pay?.deposit_paid ? num(pay.deposit_amount) : 0;
    const balancePaidAmt = num((pay as { balance_paid?: number } | undefined)?.balance_paid);
    const paidToDate = depositPaidAmt + balancePaidAmt;
    units.push({
      submission_id: s.id,
      unit_number: s.unit_number,
      full_name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      unit_type: s.unit_type || null,
      status: s.status || 'submitted',
      grand_total: totals.grandTotal,
      deposit_required: !!pay?.deposit_required,
      deposit_amount: num(pay?.deposit_amount),
      deposit_paid: !!pay?.deposit_paid,
      deposit_paid_date: pay?.deposit_paid_date ?? null,
      balance_paid: balancePaidAmt,
      balance_paid_date: (pay as { balance_paid_date?: string | null } | undefined)?.balance_paid_date ?? null,
      payments_to_date: paidToDate,
      balance_owing: Math.max(totals.grandTotal - paidToDate, 0),
      payment_status: pay?.payment_status ?? 'unbilled',
      invoice_number: pay?.invoice_number ?? null,
      lines_total: canonical.length,
      lines_ordered: nOrdered,
      lines_received: nReceived,
      lines_installed: nInstalled,
    });
  }

  // ---------- aggregate by Material + Color ----------
  const aggMap = new Map<string, PMAggregateRow>();
  for (const l of lines) {
    const mat = l.material_key || 'unknown';
    const col = l.color_name || '—';
    const key = `${mat}::${col}`;
    let agg = aggMap.get(key);
    if (!agg) {
      agg = {
        key, material_key: mat, color_name: col, area_type: '',
        total_qty: 0, ordered_qty: 0, unit_of_measure: l.unit_of_measure,
        suppliers: [], units: [],
        status_summary: { not_started: 0, ordered: 0, received: 0, installed: 0 },
      };
      aggMap.set(key, agg);
    }
    agg.total_qty += num(l.quantity_required);
    agg.ordered_qty += num(l.quantity_ordered);
    if (l.supplier && !agg.suppliers.includes(l.supplier)) agg.suppliers.push(l.supplier);
    if (!agg.units.includes(l.unit_number)) agg.units.push(l.unit_number);
    const s = l.installation_status;
    if (s === 'installed') agg.status_summary.installed++;
    else if (s === 'received' || s === 'staged') agg.status_summary.received++;
    else if (s === 'ordered') agg.status_summary.ordered++;
    else agg.status_summary.not_started++;
  }

  return {
    units,
    lines,
    aggregates: Array.from(aggMap.values()).sort((a, b) =>
      a.material_key.localeCompare(b.material_key) || a.color_name.localeCompare(b.color_name)
    ),
    suppliers: (supRes.data || []) as { id: string; name: string }[],
  };
}
