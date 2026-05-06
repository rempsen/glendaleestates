// =====================================================================
// Single-tab flat export for buyer submissions.
// Produces a wide row per client with grouped section headers.
// =====================================================================

import { format } from 'date-fns';
import {
  buildSubmissionSectionRows,
  computeTotalsForSubmission,
  type BuyerSelection,
  type ExportPricing,
} from './submissionExportBuilder';
import { buildCanonicalLines } from './submissionLineItems';
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
  totals: ReturnType<typeof computeTotalsForSubmission>;
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
      { label: 'SPC Tile Colour', get: ({ s }) => s.spc_tile_colour ?? '' },
      { label: 'SPC Tile Comments', get: ({ s }) => s.spc_tile_comments ?? '' },
      { label: 'Heated Floor Bathrooms', get: ({ s }) => s.heated_floor_bathrooms ?? 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { label: 'Custom Tiled Shower', get: ({ s }) => yesNo((s as any).custom_tiled_shower) },
      { label: 'Bathroom Tile $', get: ({ totals }) => money(totals.pieces.bathroomTile) },
      { label: 'Heated Floor $', get: ({ totals }) => money(totals.pieces.section4HeatedFloor) },
      { label: 'Custom Shower $', get: ({ totals }) => money(totals.pieces.customShower) },
    ],
  },
  {
    name: 'Backsplash & Grout',
    cols: [
      { label: 'Backsplash Orientation', get: ({ s }) => s.backsplash_orientation ?? '' },
      { label: 'Grout Change Enabled', get: ({ s }) => yesNo(s.backsplash_grout_enabled) },
      { label: 'Grout Color', get: ({ s }) => s.backsplash_grout_color ?? '' },
      { label: 'Grout Comments', get: ({ s }) => s.backsplash_grout_comments ?? '' },
      { label: 'Grout $', get: ({ totals }) => money(totals.pieces.grout) },
    ],
  },
  {
    name: 'Stairs',
    cols: [
      { label: 'Stair Upgrade Type', get: ({ s }) => s.stair_upgrade_type ?? '' },
      { label: 'Stair LVP Upgrade', get: ({ s }) => yesNo(s.stair_lvp_upgrade_selected) },
      { label: 'Stair Carpet Colour', get: ({ s }) => s.stair_carpet_colour ?? '' },
      { label: 'Premium Underpad (Stairs)', get: ({ s }) => yesNo(s.premium_underpad_stairs) },
      { label: 'Stair LVP $', get: ({ totals }) => money(totals.pieces.stairLvp) },
      { label: 'Stair Carpet $', get: ({ totals }) => money(totals.pieces.stairCarpet) },
    ],
  },
  {
    name: 'Bedroom Flooring',
    cols: [
      { label: 'Bedroom Flooring Choice', get: ({ s }) => s.bedroom_flooring_choice ?? '' },
      { label: 'Bedroom LVP Same as Main', get: ({ s }) => yesNo(s.bedroom_lvp_same_as_main) },
      { label: 'Bedroom LVP Colour', get: ({ s }) => s.bedroom_lvp_colour ?? '' },
      { label: 'Bedroom Carpet Colour', get: ({ s }) => s.bedroom_carpet_colour ?? '' },
      { label: 'Premium Carpet (Bedroom)', get: ({ s }) => yesNo(s.premium_carpet_bedroom) },
      { label: 'Premium Underpad (Bedroom)', get: ({ s }) => yesNo(s.premium_underpad_bedroom) },
    ],
  },
  {
    name: 'Window Coverings',
    cols: [
      { label: 'Additional Windows Qty', get: ({ s }) => s.additional_windows_qty ?? 0 },
      { label: 'Patio Doors Qty', get: ({ s }) => s.patio_doors_qty ?? 0 },
      { label: 'Additional Window $', get: ({ totals }) => money(totals.pieces.windowAdditional) },
      { label: 'Patio Door $', get: ({ totals }) => money(totals.pieces.windowPatio) },
      { label: 'Window Automation $', get: ({ totals }) => money(totals.pieces.windowAutomation) },
      { label: 'Window Subtotal $', get: ({ totals }) => money(totals.windowSubtotal) },
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
      { label: 'Upgrades Subtotal $', get: ({ totals }) => money(totals.upgradesSubtotal) },
      { label: 'Window Subtotal $', get: ({ totals }) => money(totals.windowSubtotal) },
      { label: 'Grand Subtotal $', get: ({ totals }) => money(totals.grandSubtotal) },
      { label: 'GST $', get: ({ totals }) => money(totals.gst) },
      { label: 'Grand Total $', get: ({ totals }) => money(totals.grandTotal) },
      {
        label: 'All Line Items',
        get: ({ totals }) =>
          totals.lineItems
            .map((li) => `${li.label}${li.detail ? ` (${li.detail})` : ''}: $${money(li.amount).toFixed(2)}`)
            .join(' | '),
      },
    ],
  },
];

function buildAreaUpgradeGroup(maxCount: number): GroupDef {
  const cols: ColDef[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = i; // capture
    const n = i + 1;
    cols.push(
      { label: `#${n} Area`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.area_name as string) ?? '' },
      { label: `#${n} Material`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.material_name as string) ?? '' },
      { label: `#${n} Product`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.product_name as string) ?? '' },
      { label: `#${n} Color`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.product_color as string) ?? '' },
      { label: `#${n} Comments`, get: ({ sections }) => (sections.area_upgrades?.[idx]?.comments as string) ?? '' },
      { label: `#${n} Heated Floor`, get: ({ sections }) => yesNo(sections.area_upgrades?.[idx]?.heated_floor) },
      { label: `#${n} Amount $`, get: ({ sections }) => Number(sections.area_upgrades?.[idx]?.amount ?? 0) },
      { label: `#${n} Heated Floor $`, get: ({ sections }) => Number(sections.area_upgrades?.[idx]?.heated_floor_amount ?? 0) },
    );
  }
  return { name: `Area Upgrades (up to ${maxCount})`, cols };
}

export function buildFlatExport(
  targets: BuyerSelection[],
  pricing: ExportPricing,
): FlatExportResult {
  // Pre-compute sections + totals so we can size the dynamic Area Upgrades group.
  const computed = targets.map((s) => {
    const sections = buildSubmissionSectionRows(s, pricing);
    const totals = computeTotalsForSubmission(s, pricing);
    return { s, sections, totals };
  });

  const maxAreaUpgrades = Math.max(
    1,
    ...computed.map((c) => (c.sections.area_upgrades || []).length),
  );

  // Insert Area Upgrades group right after Window Coverings (between index 7 and Hardwood).
  const groups: GroupDef[] = [];
  for (const g of STATIC_GROUPS) {
    groups.push(g);
    if (g.name === 'Window Coverings') {
      groups.push(buildAreaUpgradeGroup(maxAreaUpgrades));
    }
  }

  const groupHeaders: FlatExportGroup[] = groups.map((g) => ({ name: g.name, span: g.cols.length }));
  const columns: FlatExportColumn[] = groups.flatMap((g) => g.cols.map((c) => ({ label: c.label })));
  const allCols: ColDef[] = groups.flatMap((g) => g.cols);

  const rows = computed.map((ctx) => allCols.map((c) => c.get(ctx)));

  return { groups: groupHeaders, columns, rows };
}
