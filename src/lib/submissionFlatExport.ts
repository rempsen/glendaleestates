// =====================================================================
// Single-tab flat export for buyer submissions.
// Produces a wide row per client with grouped section headers.
// Phase 2 Task 11: money comes from the submission's quote lines — one
// column block per counted line and totals from sumQuoteLines.
// =====================================================================

import { format } from 'date-fns';
import { LAUNDRY_ROW_LABEL, laundryValue, STAIR_CARPET_LABEL, STAIR_STANDARD_VALUE } from './outputLabels';
import {
  buildSubmissionSectionRows,
  lineItemsText,
  totalsForLines,
  type BuyerSelection,
} from './submissionExportBuilder';
import { countsInTotal, type QuoteLine } from '@/lib/quoteLines';
import type { DownstreamData } from './fetchDownstreamData';

export interface FlatExportColumn {
  label: string;
}
export interface FlatExportGroup {
  name: string;
  span: number; // number of columns in this group
}
export interface FlatExportResult {
  groups: FlatExportGroup[];          // grouped header banners (in column order)
  columns: FlatExportColumn[];        // sub-header (one per data column)
  rows: (string | number | boolean | null)[][]; // data rows aligned to columns
}

const fmtDate = (v: string | null | undefined) =>
  v ? format(new Date(v), 'yyyy-MM-dd') : '';
const fmtDateTime = (v: string | null | undefined) =>
  v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '';
const yesNo = (b: unknown) => (b ? 'Yes' : 'No');
const money = (n: number) => Math.round(n * 100) / 100;

// Static (non-area-upgrade) group/column definitions.
type Cell = string | number | boolean | null;
type ColDef = { label: string; get: (ctx: RowCtx) => Cell };
type GroupDef = { name: string; cols: ColDef[] };

interface RowCtx {
  s: BuyerSelection;
  sections: ReturnType<typeof buildSubmissionSectionRows>;
  totals: ReturnType<typeof totalsForLines>;
  lines: QuoteLine[];
  counted: QuoteLine[];
  downstream: DownstreamData;
}

const STATIC_GROUPS: GroupDef[] = [
  {
    name: 'Client Info',
    cols: [
      { label: 'Unit #', get: ({ s }) => s.unit_number ?? '' },
      { label: 'Name', get: ({ s }) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() },
      { label: 'First Name', get: ({ s }) => s.first_name ?? '' },
      { label: 'Last Name', get: ({ s }) => s.last_name ?? '' },
      { label: 'Email', get: ({ s }) => s.email ?? '' },
      { label: 'Phone', get: ({ s }) => s.phone_number ?? '' },
      { label: 'Unit Type', get: ({ s }) => s.unit_type ?? '' },
      { label: 'Possession Date', get: ({ s }) => fmtDate(s.estimated_possession_date) },
      { label: 'Status', get: ({ s }) => s.status ?? '' },
      { label: 'Submission ID', get: ({ s }) => s.id },
      { label: 'Submitted', get: ({ s }) => fmtDateTime(s.created_at) },
      { label: 'Updated', get: ({ s }) => fmtDateTime(s.updated_at) },
      { label: 'Reviewed', get: ({ s }) => fmtDateTime(s.reviewed_at) },
      { label: 'Quoted', get: ({ s }) => fmtDateTime(s.quoted_at) },
      { label: 'Completed', get: ({ s }) => fmtDateTime(s.completed_at) },
    ],
  },
  {
    name: 'Floor Plan',
    cols: [
      { label: 'Has Stairs', get: ({ s }) => yesNo(s.has_stairs) },
      { label: 'Upgrade Floor Selection', get: ({ s }) => s.upgrade_floor_selection ?? '' },
      {
        label: 'Floor Plan Annotation Count',
        get: ({ s }) => (Array.isArray(s.floor_plan_annotations) ? s.floor_plan_annotations.length : 0),
      },
      {
        label: 'Floor Plan Annotation Notes',
        get: ({ s }) => {
          const arr = Array.isArray(s.floor_plan_annotations)
            ? (s.floor_plan_annotations as Array<Record<string, unknown>>)
            : [];
          return arr
            .map((a) => {
              const txt = (a?.text ?? a?.note ?? a?.label ?? a?.comment ?? '') as string;
              const loc = (a?.areaName ?? a?.area ?? a?.room ?? '') as string;
              return [loc, txt].filter(Boolean).join(': ');
            })
            .filter(Boolean)
            .join(' | ');
        },
      },
    ],
  },
  {
    name: 'Main LVP Flooring',
    cols: [
      { label: 'LVP Colour', get: ({ s }) => s.lvp_colour ?? '' },
      { label: 'LVP Comments', get: ({ s }) => s.lvp_comments ?? '' },
    ],
  },
  {
    name: 'Bathroom Tile & Heated Floors',
    cols: [
      { label: 'Bathroom Tile Selected', get: ({ s }) => yesNo(s.bathroom_tile_selected) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { label: 'Ensuite Tile', get: ({ s }) => yesNo((s as any).bathroom_tile_ensuite_selected) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { label: 'Guest Tile', get: ({ s }) => yesNo((s as any).bathroom_tile_guest_selected) },
      { label: 'Bathroom Tile', get: ({ s }) => s.spc_tile_colour ?? '' },
      { label: LAUNDRY_ROW_LABEL, get: ({ s }) => laundryValue(Array.isArray(s.area_upgrades) ? (s.area_upgrades as never[]) : []) },
      { label: 'Bathroom Tile Comments', get: ({ s }) => s.spc_tile_comments ?? '' },
      { label: 'Heated Floor Bathrooms', get: ({ s }) => s.heated_floor_bathrooms ?? 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { label: 'Custom Tiled Shower', get: ({ s }) => yesNo((s as any).custom_tiled_shower) },
    ],
  },
  {
    name: 'Backsplash & Grout',
    cols: [
      { label: 'Backsplash Orientation', get: ({ s }) => s.backsplash_orientation ?? '' },
      { label: 'Grout Change Enabled', get: ({ s }) => yesNo(s.backsplash_grout_enabled) },
      { label: 'Grout Color', get: ({ s }) => s.backsplash_grout_color ?? '' },
      { label: 'Grout Comments', get: ({ s }) => s.backsplash_grout_comments ?? '' },
    ],
  },
  {
    name: 'Stairs',
    cols: [
      { label: 'Stair Upgrade Type', get: ({ s }) => s.stair_upgrade_type ?? '' },
      { label: 'Stair LVP Upgrade', get: ({ s }) => yesNo(s.stair_lvp_upgrade_selected) },
      { label: STAIR_CARPET_LABEL, get: ({ s }) => {
        const upgraded = s.stair_lvp_upgrade_selected || s.stair_premium_carpet_selected || s.premium_underpad_stairs
          || s.stair_upgrade_type === 'lvp' || s.stair_upgrade_type === 'premium_lvp';
        if (!s.has_stairs || upgraded) return s.stair_carpet_colour ?? '';
        return s.stair_carpet_colour ? `${STAIR_STANDARD_VALUE} — ${s.stair_carpet_colour}` : STAIR_STANDARD_VALUE;
      } },
      { label: 'Premium Underpad (Stairs)', get: ({ s }) => yesNo(s.premium_underpad_stairs) },
    ],
  },
  {
    name: 'Bedroom Flooring',
    cols: [
      { label: 'Primary Bedroom Flooring', get: ({ s }) => s.bedroom_flooring_choice ?? '' },
      { label: 'Primary Bedroom LVP Same as Main', get: ({ s }) => yesNo(s.bedroom_lvp_same_as_main) },
      { label: 'Primary Bedroom LVP Colour', get: ({ s }) => s.bedroom_lvp_colour ?? '' },
      { label: 'Primary Bedroom Carpet Colour', get: ({ s }) => s.bedroom_carpet_colour ?? '' },
      { label: 'Premium Carpet (Primary Bedroom)', get: ({ s }) => yesNo(s.premium_carpet_bedroom) },
      { label: 'Premium Underpad (Primary Bedroom)', get: ({ s }) => yesNo(s.premium_underpad_bedroom) },
    ],
  },
  {
    name: 'Window Coverings',
    cols: [
      { label: 'Additional Windows Qty', get: ({ s }) => s.additional_windows_qty ?? 0 },
      { label: 'Patio Doors Qty', get: ({ s }) => s.patio_doors_qty ?? 0 },
      { label: 'Window Subtotal $', get: ({ totals }) => money(totals.windowCoverings) },
      { label: 'Window Comments', get: ({ s }) => s.window_comments ?? '' },
    ],
  },
  // Area Upgrades group is dynamic — inserted at runtime.
  {
    name: 'Hardwood Upgrade',
    cols: [
      { label: 'Hardwood Upgrade Selected', get: ({ s }) => yesNo(s.hardwood_upgrade_selected) },
    ],
  },
  {
    name: 'Buyer Upgrade Interests',
    cols: [
      {
        label: 'Interests',
        get: ({ sections }) =>
          (sections.upgrade_interests || [])
            .map((r) => `${r.interest_key}: ${r.value}`)
            .join(' | '),
      },
      { label: 'Interests Notes', get: ({ s }) => s.upgrade_interests_notes ?? '' },
    ],
  },
  {
    name: 'Document Uploads',
    cols: [
      {
        label: 'Documents',
        get: ({ sections }) =>
          (sections.documents || [])
            .map((d) => `${d.name || ''}${d.mime_type ? ` (${d.mime_type})` : ''}`)
            .filter(Boolean)
            .join(' | '),
      },
      {
        label: 'Document Paths',
        get: ({ sections }) =>
          (sections.documents || [])
            .map((d) => String(d.path || ''))
            .filter(Boolean)
            .join(' | '),
      },
      { label: 'Document Count', get: ({ sections }) => (sections.documents || []).length },
    ],
  },
  {
    name: 'Notes',
    cols: [
      { label: 'Sales Comments', get: ({ s }) => s.sales_comments ?? '' },
      { label: 'Upgrade Comments', get: ({ s }) => s.upgrade_comments ?? '' },
      { label: 'Admin Notes', get: ({ s }) => s.admin_notes ?? '' },
    ],
  },
  {
    name: 'Pricing Totals',
    cols: [
      { label: 'Upgrades Subtotal $', get: ({ totals }) => money(totals.upgrades) },
      { label: 'Window Subtotal $', get: ({ totals }) => money(totals.windowCoverings) },
      { label: 'Grand Subtotal $', get: ({ totals }) => money(totals.subtotal) },
      { label: 'GST $', get: ({ totals }) => money(totals.gst) },
      { label: 'Grand Total $', get: ({ totals }) => money(totals.total) },
      { label: 'All Line Items', get: ({ lines }) => lineItemsText(lines) },
    ],
  },
  {
    name: 'Payments / AR',
    cols: [
      { label: 'Deposit Required', get: ({ downstream, s }) => yesNo(downstream.payments[s.id]?.deposit_required) },
      { label: 'Deposit Amount $', get: ({ downstream, s }) => money(Number(downstream.payments[s.id]?.deposit_amount ?? 0)) },
      { label: 'Deposit Paid', get: ({ downstream, s }) => yesNo(downstream.payments[s.id]?.deposit_paid) },
      { label: 'Deposit Paid Date', get: ({ downstream, s }) => fmtDate(downstream.payments[s.id]?.deposit_paid_date) },
      { label: 'Balance Owing $', get: ({ downstream, s }) => money(Number(downstream.payments[s.id]?.balance_owing ?? 0)) },
      { label: 'Invoice #', get: ({ downstream, s }) => downstream.payments[s.id]?.invoice_number ?? '' },
      { label: 'Payment Status', get: ({ downstream, s }) => downstream.payments[s.id]?.payment_status ?? '' },
      { label: 'Payment Notes', get: ({ downstream, s }) => downstream.payments[s.id]?.notes ?? '' },
    ],
  },
  {
    name: 'Ownership / RACI',
    cols: [
      { label: 'Designer Assigned', get: ({ downstream, s }) => downstream.ownership[s.id]?.designer_assigned ?? '' },
      { label: 'Sales Rep', get: ({ downstream, s }) => downstream.ownership[s.id]?.sales_rep ?? '' },
      { label: 'Next Action', get: ({ downstream, s }) => downstream.ownership[s.id]?.next_action ?? '' },
      { label: 'Next Action Owner', get: ({ downstream, s }) => downstream.ownership[s.id]?.next_action_owner ?? '' },
      { label: 'Due Date', get: ({ downstream, s }) => fmtDate(downstream.ownership[s.id]?.due_date) },
      { label: 'Risk Level', get: ({ downstream, s }) => downstream.ownership[s.id]?.risk_level ?? '' },
      { label: 'Ownership Notes', get: ({ downstream, s }) => downstream.ownership[s.id]?.notes ?? '' },
    ],
  },
];

function buildAreaUpgradeGroup(maxCount: number): GroupDef {
  const cols: ColDef[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = i; // capture
    const n = i + 1;
    const lk = `area_upgrade:${idx}`;
    cols.push(
      { label: `#${n} Area`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.area_name as string) ?? '' },
      { label: `#${n} Material`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.material_name as string) ?? '' },
      { label: `#${n} Product`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.product_name as string) ?? '' },
      { label: `#${n} Color`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.product_color as string) ?? '' },
      { label: `#${n} Client Note`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.client_comment as string) ?? '' },
      { label: `#${n} Internal Note`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.comments as string) ?? '' },
      { label: `#${n} Heated Floor`, get: ({ sections }) => yesNo(sections.area_upgrades?.[idx]?.heated_floor) },
      { label: `#${n} Approval Status`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.approval_status ?? '' },
      { label: `#${n} Supplier`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.supplier ?? '' },
      { label: `#${n} SKU`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.sku ?? '' },
      { label: `#${n} Qty Required`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.quantity_required ?? '' },
      { label: `#${n} Qty Ordered`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.quantity_ordered ?? '' },
      { label: `#${n} PO #`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.po_number ?? '' },
      { label: `#${n} Order Date`, get: ({ downstream, s }) => fmtDate(downstream.lineItems[s.id]?.[lk]?.order_date) },
      { label: `#${n} Expected Delivery`, get: ({ downstream, s }) => fmtDate(downstream.lineItems[s.id]?.[lk]?.expected_delivery) },
      { label: `#${n} Received Date`, get: ({ downstream, s }) => fmtDate(downstream.lineItems[s.id]?.[lk]?.received_date) },
      { label: `#${n} Storage Location`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.storage_location ?? '' },
      { label: `#${n} Installation Status`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.installation_status ?? '' },
      { label: `#${n} Risk Level`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.risk_level ?? '' },
      { label: `#${n} Procurement Notes`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[lk]?.notes ?? '' },
    );
  }
  return { name: `Area Upgrades (up to ${maxCount})`, cols };
}

// One column block per counted quote line (location / item / qty / unit price / amount), plus its procurement
// tracking by quote_line_id (submission_line_items rows keyed by the line id).
function buildQuoteLineGroup(maxCount: number): GroupDef {
  const cols: ColDef[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = i;
    const n = i + 1;
    const ln = (ctx: RowCtx) => ctx.counted[idx];
    const tr = (ctx: RowCtx) => { const l = ln(ctx); return l?.id ? ctx.downstream.lineItems[ctx.s.id]?.[l.id] : undefined; };
    cols.push(
      { label: `Line #${n} Section`, get: (c) => ln(c)?.section ?? '' },
      { label: `Line #${n} Location`, get: (c) => ln(c)?.location ?? '' },
      { label: `Line #${n} Item`, get: (c) => ln(c)?.label ?? '' },
      { label: `Line #${n} Product`, get: (c) => { const l = ln(c); return l ? [l.product_name, l.product_colour].filter(Boolean).join(' — ') : ''; } },
      { label: `Line #${n} Qty`, get: (c) => ln(c)?.quantity ?? '' },
      { label: `Line #${n} Unit Price $`, get: (c) => { const u = ln(c)?.unit_price; return u == null ? '' : money(u); } },
      { label: `Line #${n} Amount $`, get: (c) => { const l = ln(c); return l ? money(l.amount as number) : ''; } },
      { label: `Line #${n} Status`, get: (c) => ln(c)?.status ?? '' },
      { label: `Line #${n} Supplier`, get: (c) => tr(c)?.supplier ?? '' },
      { label: `Line #${n} PO #`, get: (c) => tr(c)?.po_number ?? '' },
      { label: `Line #${n} Installation Status`, get: (c) => tr(c)?.installation_status ?? '' },
    );
  }
  return { name: `Quote Lines (up to ${maxCount})`, cols };
}

// Builds a procurement group for the fixed (non-area-upgrade) line keys.
// One sub-group of columns per key; surfaces approval + procurement fields.
const FIXED_PROCUREMENT_KEYS: { key: string; label: string }[] = [
  { key: 'bathroom_tile', label: 'Bathroom Tile' },
  { key: 'heated_floor', label: 'Heated Floor' },
  { key: 'custom_shower', label: 'Custom Shower' },
  { key: 'grout', label: 'Grout' },
  { key: 'stair_lvp', label: 'Stair LVP' },
  { key: 'stair_carpet', label: 'Stair Carpet' },
  { key: 'window_additional', label: 'Add. Windows' },
  { key: 'window_patio', label: 'Patio Doors' },
  { key: 'window_automation', label: 'Window Automation' },
];

function buildFixedProcurementGroup(): GroupDef {
  const cols: ColDef[] = [];
  for (const { key, label } of FIXED_PROCUREMENT_KEYS) {
    cols.push(
      { label: `${label}: Approval`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.approval_status ?? '' },
      { label: `${label}: Supplier`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.supplier ?? '' },
      { label: `${label}: SKU`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.sku ?? '' },
      { label: `${label}: Qty Req`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.quantity_required ?? '' },
      { label: `${label}: Qty Ord`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.quantity_ordered ?? '' },
      { label: `${label}: PO #`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.po_number ?? '' },
      { label: `${label}: Order Date`, get: ({ downstream, s }) => fmtDate(downstream.lineItems[s.id]?.[key]?.order_date) },
      { label: `${label}: Exp Delivery`, get: ({ downstream, s }) => fmtDate(downstream.lineItems[s.id]?.[key]?.expected_delivery) },
      { label: `${label}: Received`, get: ({ downstream, s }) => fmtDate(downstream.lineItems[s.id]?.[key]?.received_date) },
      { label: `${label}: Storage`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.storage_location ?? '' },
      { label: `${label}: Install Status`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.installation_status ?? '' },
      { label: `${label}: Risk`, get: ({ downstream, s }) => downstream.lineItems[s.id]?.[key]?.risk_level ?? '' },
    );
  }
  return { name: 'Procurement (Fixed Line Items)', cols };
}

import type { DownstreamData as _DD } from './fetchDownstreamData';
const EMPTY_DOWNSTREAM: _DD = { payments: {}, ownership: {}, lineItems: {} };

export function buildFlatExport(
  targets: BuyerSelection[],
  linesBySubmission: Record<string, QuoteLine[]>,
  gstRate: number,
  downstream: _DD = EMPTY_DOWNSTREAM,
): FlatExportResult {
  // Pre-compute sections + totals so we can size the dynamic groups.
  const computed: RowCtx[] = targets.map((s) => {
    const lines = linesBySubmission[s.id] ?? [];
    const sections = buildSubmissionSectionRows(s, lines, gstRate);
    const totals = totalsForLines(lines, gstRate);
    return { s, sections, totals, lines, counted: lines.filter(countsInTotal), downstream };
  });

  const maxAreaUpgrades = Math.max(1, ...computed.map((c) => (c.sections.area_upgrades || []).length));
  const maxLines = Math.max(1, ...computed.map((c) => c.counted.length));

  // Area Upgrades right after Window Coverings; quote lines after Pricing Totals; fixed procurement at the end.
  const groups: GroupDef[] = [];
  for (const g of STATIC_GROUPS) {
    groups.push(g);
    if (g.name === 'Window Coverings') groups.push(buildAreaUpgradeGroup(maxAreaUpgrades));
    if (g.name === 'Pricing Totals') groups.push(buildQuoteLineGroup(maxLines));
  }
  groups.push(buildFixedProcurementGroup());

  const groupHeaders: FlatExportGroup[] = groups.map((g) => ({ name: g.name, span: g.cols.length }));
  const columns: FlatExportColumn[] = groups.flatMap((g) => g.cols.map((c) => ({ label: c.label })));
  const allCols: ColDef[] = groups.flatMap((g) => g.cols);

  const rows = computed.map((ctx) => allCols.map((c) => c.get(ctx)));

  return { groups: groupHeaders, columns, rows };
}
