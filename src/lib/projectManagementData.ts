// =====================================================================
// Loads everything the Project Management page needs:
//   - All buyer_selections
//   - submission_payments / ownership / line_items
//   - quote_lines (Phase 2 Task 11): canonical PM lines are the counted +
//     included quote lines keyed by quote_line_id; submissions with no stored
//     lines fall back to the generator (same rule as the PDF/Word/exports)
// Returns three derived shapes: per-unit rows, line-item rows, aggregate rows.
// =====================================================================

import { supabase } from '@/integrations/supabase/client';
import { sumQuoteLines, type QuoteLine } from '@/lib/quoteLines';
import { buildPmCanonicalLines, legacyKeysForLines } from '@/lib/submissionLineItems';
import { loadLinesForSubmissions } from '@/lib/submissionLinesLoader';
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
  /** The quote line this PM line is (also its `line_key` for new submission_line_items rows). */
  quote_line_id: string;
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

export interface PMInputs {
  submissions: Submission[];
  /** Quote lines per submission id (stored, or generated when none are stored). */
  linesBySubmission: Record<string, QuoteLine[]>;
  gstRate: number;
  payments: SubmissionPaymentRow[];
  lineItems: SubmissionLineItemRow[];
  suppliers: { id: string; name: string }[];
}

/** Pure: per-unit, per-line and aggregate PM rows from quote lines. Totals via sumQuoteLines only. */
export function derivePMData(input: PMInputs): PMData {
  const payments = new Map<string, SubmissionPaymentRow>();
  input.payments.forEach((r) => payments.set(r.submission_id, r));
  const linesBySub = new Map<string, Map<string, SubmissionLineItemRow>>();
  input.lineItems.forEach((row) => {
    if (!linesBySub.has(row.submission_id)) linesBySub.set(row.submission_id, new Map());
    linesBySub.get(row.submission_id)!.set(row.line_key, row);
  });

  const units: PMUnitRow[] = [];
  const lines: PMLineRow[] = [];

  for (const s of input.submissions) {
    const quoteLines = input.linesBySubmission[s.id] ?? [];
    const sums = sumQuoteLines(quoteLines, input.gstRate);
    const canonical = buildPmCanonicalLines(quoteLines);
    const legacy = legacyKeysForLines(quoteLines, canonical);
    const subLines = linesBySub.get(s.id) || new Map<string, SubmissionLineItemRow>();

    let nOrdered = 0, nReceived = 0, nInstalled = 0;
    canonical.forEach((cl) => {
      // New rows are keyed by quote_line_id; rows saved before the cutover keep their legacy keys (untouched).
      const legacyKey = legacy.get(cl.quote_line_id);
      const tracked = subLines.get(cl.line_key) ?? (legacyKey ? subLines.get(legacyKey) : undefined);
      const status = tracked?.installation_status || 'not_started';
      if (status === 'ordered' || status === 'received' || status === 'installed' || status === 'staged') nOrdered++;
      if (status === 'received' || status === 'staged' || status === 'installed') nReceived++;
      if (status === 'installed') nInstalled++;
      lines.push({
        submission_id: s.id,
        quote_line_id: cl.quote_line_id,
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
      grand_total: sums.total,
      deposit_required: !!pay?.deposit_required,
      deposit_amount: num(pay?.deposit_amount),
      deposit_paid: !!pay?.deposit_paid,
      deposit_paid_date: pay?.deposit_paid_date ?? null,
      balance_paid: balancePaidAmt,
      balance_paid_date: (pay as { balance_paid_date?: string | null } | undefined)?.balance_paid_date ?? null,
      payments_to_date: paidToDate,
      balance_owing: Math.max(sums.total - paidToDate, 0),
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
    suppliers: input.suppliers,
  };
}

export async function loadProjectManagementData(): Promise<PMData> {
  const [subRes, payRes, lineRes, supRes] = await Promise.all([
    supabase.from('buyer_selections').select('*').order('unit_number'),
    supabase.from('submission_payments').select('*'),
    supabase.from('submission_line_items').select('*'),
    supabase.from('suppliers').select('id,name').eq('is_active', true).order('name'),
  ]);
  const submissions = (subRes.data || []) as Submission[];
  const { linesBySubmission, gstRate } = await loadLinesForSubmissions(submissions);
  return derivePMData({
    submissions,
    linesBySubmission,
    gstRate,
    payments: (payRes.data || []) as SubmissionPaymentRow[],
    lineItems: (lineRes.data || []) as SubmissionLineItemRow[],
    suppliers: (supRes.data || []) as { id: string; name: string }[],
  });
}
