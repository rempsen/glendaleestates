// =====================================================================
// Canonical line-key generator for downstream tracking.
// A "line" is anything that can be approved / procured / installed.
// Keys are stable so submission_line_items rows can be joined across
// re-exports and edits.
// =====================================================================

import type { BuyerSelection } from './submissionExportBuilder';

export interface CanonicalLine {
  line_key: string;
  line_label: string;
  amount: number;
  material_key: string | null;
  color_name: string | null;
  area_type: string | null;
  quantity: number;
  unit_of_measure: string;
}

export function buildCanonicalLines(
  s: BuyerSelection,
  totals: {
    pieces: {
      bathroomTile: number;
      bathroomTileSqft?: number;
      section4HeatedFloor: number;
      customShower: number;
      grout: number;
      stairLvp: number;
      stairCarpet: number;
      stairUnderpad?: number;
      windowAdditional: number;
      windowPatio: number;
      windowAutomation: number;
      flooringUpgrades: { areaId: string; areaName: string; materialName: string; amount: number; heatedFloorAmount: number; productName?: string; productColor?: string; sqft?: number }[];
    };
  },
): CanonicalLine[] {
  const out: CanonicalLine[] = [];
  const push = (
    k: string, l: string, a: number,
    extra: Partial<CanonicalLine> = {},
  ) => {
    if (a > 0) out.push({
      line_key: k, line_label: l, amount: a,
      material_key: null, color_name: null, area_type: null,
      quantity: 1, unit_of_measure: 'unit',
      ...extra,
    });
  };
  push('bathroom_tile', 'Bathroom Tile', totals.pieces.bathroomTile, {
    material_key: 'tile', area_type: 'bathroom', unit_of_measure: 'sqft',
    quantity: Number(totals.pieces.bathroomTileSqft) || 1,
  });
  push('heated_floor', 'Heated Floor (Bathrooms)', totals.pieces.section4HeatedFloor, {
    material_key: 'heated_floor', area_type: 'bathroom',
    quantity: Number((s as { heated_floor_bathrooms?: number }).heated_floor_bathrooms) || 1,
  });
  push('custom_shower', 'Custom Tiled Shower', totals.pieces.customShower, {
    material_key: 'tiled_shower', area_type: 'bathroom',
  });
  push('grout', 'Backsplash Grout', totals.pieces.grout, {
    material_key: 'grout', color_name: (s as { backsplash_grout_color?: string }).backsplash_grout_color || null,
    area_type: 'kitchen',
  });
  (totals.pieces as { customItems?: Array<{ label: string; amount: number }> }).customItems?.forEach((ci, idx) => {
    push(`custom_${idx + 1}`, ci.label, ci.amount, { material_key: 'custom', area_type: 'custom' });
  });
  push('stair_lvp', 'Stair LVP Upgrade', totals.pieces.stairLvp, {
    material_key: 'stair_lvp', area_type: 'stairs',
  });
  push('stair_underpad', 'Stair Premium Underpad', totals.pieces.stairUnderpad || 0, {
    material_key: 'premium_underpad_stairs', area_type: 'stairs',
  });
  push('stair_carpet', 'Stair Carpet Upgrade', totals.pieces.stairCarpet, {
    material_key: 'stair_carpet', area_type: 'stairs',
  });
  push('window_additional', 'Additional Windows', totals.pieces.windowAdditional, {
    material_key: 'window_blind', area_type: 'window',
    quantity: Number((s as { additional_windows_qty?: number }).additional_windows_qty) || 1,
  });
  push('window_patio', 'Patio Doors', totals.pieces.windowPatio, {
    material_key: 'patio_door', area_type: 'window',
    quantity: Number((s as { patio_doors_qty?: number }).patio_doors_qty) || 1,
  });
  push('window_automation', 'Window Automation', totals.pieces.windowAutomation, {
    material_key: 'window_automation', area_type: 'window',
    quantity: Number((s as { automated_windows_qty?: number }).automated_windows_qty) || 1,
  });

  (totals.pieces.flooringUpgrades || []).forEach((u, i) => {
    out.push({
      line_key: `area_upgrade:${i}`,
      line_label: `${u.areaName} - ${u.materialName}`,
      amount: u.amount + u.heatedFloorAmount,
      material_key: u.materialName,
      color_name: u.productColor || u.productName || null,
      area_type: u.areaId,
      quantity: Number(u.sqft) || 1,
      unit_of_measure: 'sqft',
    });
  });
  return out;
}

export const APPROVAL_STATUSES = [
  'pending_client_confirmation',
  'approved',
  'pending_pricing',
  'rejected',
  'revised',
] as const;

export const INSTALLATION_STATUSES = [
  'not_started',
  'ordered',
  'received',
  'staged',
  'installed',
] as const;

export const RISK_LEVELS = ['green', 'yellow', 'red'] as const;

export const PAYMENT_STATUSES = [
  'unbilled',
  'invoiced',
  'partial',
  'paid',
  'overdue',
] as const;
