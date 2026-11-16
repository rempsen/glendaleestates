// =====================================================================
// Submission Export Builder
// Produces section-organized row data for a buyer_selections record.
// Used by AdminExport for both XLSX (one sheet per section) and
// CSV ZIP (one CSV per section) outputs.
// All money values use computeUpgradeTotals so they match the rest of
// the app/pdf/email exactly.
// =====================================================================

import { format } from 'date-fns';
import { computeUpgradeTotals, UpgradeTotalsPricing } from '@/lib/upgradeTotals';
import { normalizeUnitTypeCode } from '@/lib/upgradeCostData';
import type { Tables } from '@/integrations/supabase/types';

export type BuyerSelection = Tables<'buyer_selections'>;

export interface ExportPricing {
  markupPercentage: number;
  gstRate: number;
  patioDoorPrice: number;
  additionalWindowPrice: number;
  automatedMotorPrice: number;
  heatedFloorPrice: number;
  backsplashGroutPrice: number;
  stairLvpUpgradePrice: number;
  stairPremiumLvpUpgradePrice?: number;
  stairCarpetUpgradePrice: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMaterialCost: (m: any) => number;
  getUnitAreaData: (code: string) => Record<string, number | undefined> | null;
}

export interface SectionDef {
  id: string;
  number: number;
  name: string;
  filename: string;
  columns: string[];
}

// 13 sections that mirror the buyer wizard
export const EXPORT_SECTIONS: SectionDef[] = [
  {
    id: 'client_info',
    number: 1,
    name: '01 Client Info',
    filename: '01-client-info.csv',
    columns: [
      'submission_id', 'unit_number', 'unit_type', 'first_name', 'last_name',
      'email', 'phone_number', 'estimated_possession_date', 'status',
      'created_at', 'updated_at', 'reviewed_at', 'quoted_at', 'completed_at',
    ],
  },
  {
    id: 'floor_plan',
    number: 2,
    name: '02 Floor Plan & Floor Selection',
    filename: '02-floor-plan.csv',
    columns: ['submission_id', 'unit_number', 'has_stairs', 'upgrade_floor_selection', 'floor_plan_annotations_count', 'floor_plan_annotations_json'],
  },
  {
    id: 'main_lvp',
    number: 3,
    name: '03 Main LVP Flooring',
    filename: '03-main-lvp-flooring.csv',
    columns: ['submission_id', 'unit_number', 'lvp_colour', 'lvp_comments'],
  },
  {
    id: 'bathroom_tile',
    number: 4,
    name: '04 Bathroom Tile & Heated Floors',
    filename: '04-bathroom-tile.csv',
    columns: [
      'submission_id', 'unit_number',
      'bathroom_tile_selected', 'bathroom_tile_ensuite_selected', 'bathroom_tile_guest_selected',
      'spc_tile_colour', 'spc_tile_comments',
      'heated_floor_bathrooms', 'custom_tiled_shower',
      'bathroom_tile_charge', 'heated_floor_charge', 'custom_shower_charge',
    ],
  },
  {
    id: 'backsplash',
    number: 5,
    name: '05 Backsplash & Grout',
    filename: '05-backsplash.csv',
    columns: [
      'submission_id', 'unit_number', 'backsplash_orientation',
      'backsplash_grout_enabled', 'backsplash_grout_color', 'backsplash_grout_comments',
      'backsplash_grout_charge',
    ],
  },
  {
    id: 'stairs',
    number: 6,
    name: '06 Stairs',
    filename: '06-stairs.csv',
    columns: [
      'submission_id', 'unit_number', 'has_stairs',
      'stair_upgrade_type', 'stair_lvp_upgrade_selected',
      'stair_carpet_colour', 'premium_underpad_stairs',
      'stair_lvp_charge', 'stair_carpet_charge',
    ],
  },
  {
    id: 'bedroom_flooring',
    number: 7,
    name: '07 Bedroom Flooring',
    filename: '07-bedroom-flooring.csv',
    columns: [
      'submission_id', 'unit_number',
      'bedroom_flooring_choice',
      'bedroom_lvp_same_as_main', 'bedroom_lvp_colour',
      'bedroom_carpet_colour', 'premium_carpet_bedroom', 'premium_underpad_bedroom',
    ],
  },
  {
    id: 'window_coverings',
    number: 8,
    name: '08 Window Coverings',
    filename: '08-window-coverings.csv',
    columns: [
      'submission_id', 'unit_number',
      'additional_windows_qty', 'patio_doors_qty',
      'additional_window_charge', 'patio_door_charge', 'window_automation_charge',
      'window_subtotal', 'window_total_db', 'window_comments',
    ],
  },
  {
    id: 'area_upgrades',
    number: 9,
    name: '09 Area Upgrades (per area)',
    filename: '09-area-upgrades.csv',
    // long form: one row per area upgrade per client
    columns: [
      'submission_id', 'unit_number', 'first_name', 'last_name',
      'area_id', 'area_name', 'material_type', 'material_name',
      'product_name', 'product_color', 'comments',
      'heated_floor', 'amount', 'heated_floor_amount',
    ],
  },
  {
    id: 'hardwood',
    number: 10,
    name: '10 Hardwood Upgrade',
    filename: '10-hardwood-upgrade.csv',
    columns: ['submission_id', 'unit_number', 'hardwood_upgrade_selected'],
  },
  {
    id: 'upgrade_interests',
    number: 11,
    name: '11 Buyer Upgrade Interests',
    filename: '11-upgrade-interests.csv',
    columns: ['submission_id', 'unit_number', 'first_name', 'last_name', 'interest_key', 'value'],
  },
  {
    id: 'documents',
    number: 12,
    name: '12 Document Uploads',
    filename: '12-document-uploads.csv',
    columns: ['submission_id', 'unit_number', 'first_name', 'last_name', 'document_index', 'name', 'path', 'mime_type', 'size_bytes'],
  },
  {
    id: 'notes_pricing',
    number: 13,
    name: '13 Notes & Pricing Totals',
    filename: '13-notes-pricing.csv',
    columns: [
      'submission_id', 'unit_number', 'first_name', 'last_name',
      'sales_comments', 'upgrade_comments', 'upgrade_interests_notes',
      'window_comments', 'lvp_comments', 'spc_tile_comments', 'backsplash_grout_comments',
      'admin_notes',
      'window_subtotal', 'upgrades_subtotal', 'grand_subtotal', 'gst', 'grand_total',
      'all_line_items',
    ],
  },
];

// ---------- helpers ----------
const fmtDate = (v: string | null | undefined) =>
  v ? format(new Date(v), 'yyyy-MM-dd HH:mm') : '';

const fmtMoney = (n: number) => Math.round(n * 100) / 100;

function buildPricingAdapter(p: ExportPricing): UpgradeTotalsPricing {
  return {
    markupPercentage: p.markupPercentage,
    gstRate: p.gstRate,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getMaterialCost: (m: any) => p.getMaterialCost(m),
    getGroutColorFee: () => p.backsplashGroutPrice,
    getAdditionalWindowPrice: () => p.additionalWindowPrice,
    getPatioDoorPrice: () => p.patioDoorPrice,
    getAutomatedMotorPrice: () => p.automatedMotorPrice,
    getHeatedFloorPrice: () => p.heatedFloorPrice,
    getStairLvpUpgradePrice: () => p.stairLvpUpgradePrice,
    getStairPremiumLvpUpgradePrice: () => (p as any).stairPremiumLvpUpgradePrice || 0,
    getStairCarpetUpgradePrice: () => p.stairCarpetUpgradePrice,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getUnitAreaData: (code: string) => p.getUnitAreaData(code) as any,
  };
}

export function computeTotalsForSubmission(s: BuyerSelection, pricing: ExportPricing) {
  return computeUpgradeTotals(
    {
      unitTypeCode: s.unit_type ? normalizeUnitTypeCode(s.unit_type) : null,
      upgradeFloorSelection: (s.upgrade_floor_selection as '1' | '2' | null) || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areaUpgrades: ((s.area_upgrades || []) as any[]),
      backsplashGrout: s.backsplash_grout_enabled
        ? {
            enabled: true,
            groutColor: s.backsplash_grout_color || '',
            comments: s.backsplash_grout_comments || '',
          }
        : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stairLvpUpgradeSelected: !!(s as any).stair_lvp_upgrade_selected,
      stairUpgradeType: (s as any).stair_upgrade_type || null,
      stairPremiumCarpetSelected: !!(s as any).stair_premium_carpet_selected,
      additionalWindowsQty: s.additional_windows_qty || 0,
      patioDoorsQty: s.patio_doors_qty || 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      automatedWindowsQty: (s as any).automated_windows_qty || 0,
      bathroomTileSelected: !!s.bathroom_tile_selected,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bathroomTileEnsuiteSelected: (s as any).bathroom_tile_ensuite_selected ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bathroomTileGuestSelected: (s as any).bathroom_tile_guest_selected ?? undefined,
      heatedFloorBathrooms: s.heated_floor_bathrooms || 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customTiledShower: !!(s as any).custom_tiled_shower,
      customPricing: (s as any).custom_pricing,
    },
    buildPricingAdapter(pricing),
  );
}

// Returns rows per section. Each entry is an array of plain objects keyed by the
// section's column list. Most sections have exactly one row per submission;
// area_upgrades / upgrade_interests / documents are long-form (zero or more
// rows per submission).
export function buildSubmissionSectionRows(
  s: BuyerSelection,
  pricing: ExportPricing,
): Record<string, Record<string, unknown>[]> {
  const totals = computeTotalsForSubmission(s, pricing);
  const id = s.id;
  const unit = s.unit_number;
  const first = s.first_name;
  const last = s.last_name;

  const out: Record<string, Record<string, unknown>[]> = {};

  out.client_info = [{
    submission_id: id,
    unit_number: unit,
    unit_type: s.unit_type ?? '',
    first_name: first,
    last_name: last,
    email: s.email,
    phone_number: s.phone_number ?? '',
    estimated_possession_date: s.estimated_possession_date ?? '',
    status: s.status ?? '',
    created_at: fmtDate(s.created_at),
    updated_at: fmtDate(s.updated_at),
    reviewed_at: fmtDate(s.reviewed_at),
    quoted_at: fmtDate(s.quoted_at),
    completed_at: fmtDate(s.completed_at),
  }];

  out.floor_plan = [{
    submission_id: id,
    unit_number: unit,
    has_stairs: !!s.has_stairs,
    upgrade_floor_selection: s.upgrade_floor_selection ?? '',
    floor_plan_annotations_count: Array.isArray(s.floor_plan_annotations) ? s.floor_plan_annotations.length : 0,
    floor_plan_annotations_json: JSON.stringify(s.floor_plan_annotations ?? []),
  }];

  out.main_lvp = [{
    submission_id: id,
    unit_number: unit,
    lvp_colour: s.lvp_colour ?? '',
    lvp_comments: s.lvp_comments ?? '',
  }];

  out.bathroom_tile = [{
    submission_id: id,
    unit_number: unit,
    bathroom_tile_selected: !!s.bathroom_tile_selected,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bathroom_tile_ensuite_selected: !!(s as any).bathroom_tile_ensuite_selected,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bathroom_tile_guest_selected: !!(s as any).bathroom_tile_guest_selected,
    spc_tile_colour: s.spc_tile_colour ?? '',
    spc_tile_comments: s.spc_tile_comments ?? '',
    heated_floor_bathrooms: s.heated_floor_bathrooms ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    custom_tiled_shower: !!(s as any).custom_tiled_shower,
    bathroom_tile_charge: fmtMoney(totals.pieces.bathroomTile),
    heated_floor_charge: fmtMoney(totals.pieces.section4HeatedFloor),
    custom_shower_charge: fmtMoney(totals.pieces.customShower),
  }];

  out.backsplash = [{
    submission_id: id,
    unit_number: unit,
    backsplash_orientation: s.backsplash_orientation ?? '',
    backsplash_grout_enabled: !!s.backsplash_grout_enabled,
    backsplash_grout_color: s.backsplash_grout_color ?? '',
    backsplash_grout_comments: s.backsplash_grout_comments ?? '',
    backsplash_grout_charge: fmtMoney(totals.pieces.grout),
  }];

  out.stairs = [{
    submission_id: id,
    unit_number: unit,
    has_stairs: !!s.has_stairs,
    stair_upgrade_type: s.stair_upgrade_type ?? '',
    stair_lvp_upgrade_selected: !!s.stair_lvp_upgrade_selected,
    stair_carpet_colour: s.stair_carpet_colour ?? '',
    premium_underpad_stairs: !!s.premium_underpad_stairs,
    stair_lvp_charge: fmtMoney(totals.pieces.stairLvp),
    stair_carpet_charge: fmtMoney(totals.pieces.stairCarpet),
  }];

  out.bedroom_flooring = [{
    submission_id: id,
    unit_number: unit,
    bedroom_flooring_choice: s.bedroom_flooring_choice ?? '',
    bedroom_lvp_same_as_main: s.bedroom_lvp_same_as_main,
    bedroom_lvp_colour: s.bedroom_lvp_colour ?? '',
    bedroom_carpet_colour: s.bedroom_carpet_colour ?? '',
    premium_carpet_bedroom: !!s.premium_carpet_bedroom,
    premium_underpad_bedroom: !!s.premium_underpad_bedroom,
  }];

  out.window_coverings = [{
    submission_id: id,
    unit_number: unit,
    additional_windows_qty: s.additional_windows_qty ?? 0,
    patio_doors_qty: s.patio_doors_qty ?? 0,
    additional_window_charge: fmtMoney(totals.pieces.windowAdditional),
    patio_door_charge: fmtMoney(totals.pieces.windowPatio),
    window_automation_charge: fmtMoney(totals.pieces.windowAutomation),
    window_subtotal: fmtMoney(totals.windowSubtotal),
    window_total_db: s.window_total ?? 0,
    window_comments: s.window_comments ?? '',
  }];

  // Long form: area upgrades
  out.area_upgrades = (totals.pieces.flooringUpgrades || []).map((u) => ({
    submission_id: id,
    unit_number: unit,
    first_name: first,
    last_name: last,
    area_id: u.areaId,
    area_name: u.areaName,
    material_type: '',
    material_name: u.materialName,
    product_name: u.productName ?? '',
    product_color: u.productColor ?? '',
    comments: '',
    heated_floor: u.heatedFloorAmount > 0,
    amount: fmtMoney(u.amount),
    heated_floor_amount: fmtMoney(u.heatedFloorAmount),
  }));

  // Pull comments + material_type from the raw selection (computeUpgradeTotals
  // strips them) and merge by index.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAreaUpgrades = Array.isArray(s.area_upgrades) ? (s.area_upgrades as any[]) : [];
  out.area_upgrades.forEach((row, i) => {
    const raw = rawAreaUpgrades[i];
    if (raw) {
      row.material_type = raw.materialType ?? row.material_type;
      row.comments = raw.comments ?? '';
    }
  });

  out.hardwood = [{
    submission_id: id,
    unit_number: unit,
    hardwood_upgrade_selected: !!s.hardwood_upgrade_selected,
  }];

  // Long form: upgrade interests
  out.upgrade_interests = [];
  const interests = (s.upgrade_interests || {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(interests)) {
    if (value === false || value === null || value === undefined || value === '') continue;
    out.upgrade_interests.push({
      submission_id: id,
      unit_number: unit,
      first_name: first,
      last_name: last,
      interest_key: key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
    });
  }

  // Long form: documents
  out.documents = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs = Array.isArray(s.document_uploads) ? (s.document_uploads as any[]) : [];
  docs.forEach((d, i) => {
    out.documents.push({
      submission_id: id,
      unit_number: unit,
      first_name: first,
      last_name: last,
      document_index: i + 1,
      name: d?.name ?? d?.fileName ?? '',
      path: d?.path ?? d?.url ?? d?.storagePath ?? '',
      mime_type: d?.mimeType ?? d?.type ?? '',
      size_bytes: d?.size ?? '',
    });
  });

  out.notes_pricing = [{
    submission_id: id,
    unit_number: unit,
    first_name: first,
    last_name: last,
    sales_comments: s.sales_comments ?? '',
    upgrade_comments: s.upgrade_comments ?? '',
    upgrade_interests_notes: s.upgrade_interests_notes ?? '',
    window_comments: s.window_comments ?? '',
    lvp_comments: s.lvp_comments ?? '',
    spc_tile_comments: s.spc_tile_comments ?? '',
    backsplash_grout_comments: s.backsplash_grout_comments ?? '',
    admin_notes: s.admin_notes ?? '',
    window_subtotal: fmtMoney(totals.windowSubtotal),
    upgrades_subtotal: fmtMoney(totals.upgradesSubtotal),
    grand_subtotal: fmtMoney(totals.grandSubtotal),
    gst: fmtMoney(totals.gst),
    grand_total: fmtMoney(totals.grandTotal),
    all_line_items: totals.lineItems
      .map((li) => `${li.label}${li.detail ? ` (${li.detail})` : ''}: $${fmtMoney(li.amount).toFixed(2)}`)
      .join(' | '),
  }];

  return out;
}
