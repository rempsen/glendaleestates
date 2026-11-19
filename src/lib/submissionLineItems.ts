// =====================================================================
// Canonical line-key generator for downstream tracking.
// A "line" is anything that can be approved / procured / installed.
// Keys are stable so submission_line_items rows can be joined across
// re-exports and edits.
// =====================================================================

import type { BuyerSelection } from './submissionExportBuilder';
import { countsInTotal, type QuoteLine } from '@/lib/quoteLines';

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

// ---------------------------------------------------------------------
// Phase 2 Task 11: canonical PM lines from quote lines, keyed by quote_line_id.
// ---------------------------------------------------------------------

/** A PM/ordering line derived from one quote line (counted or included). `line_key` = `quote_line_id`. */
export interface PmCanonicalLine extends CanonicalLine {
  quote_line_id: string;
  section: QuoteLine['section'];
  location: string;
  status: QuoteLine['status'];
}

/** Stable key for a line without a DB id (generator fallback for a submission with no stored lines yet). */
const fallbackLineId = (l: QuoteLine, i: number) => `generated:${l.wizard_field || l.section}:${l.sort_order}:${i}`;

/**
 * Every line that is ordered or installed: counted upgrades and included standard items. Pending / under review /
 * deferred / removed lines are not orderable (spec §6.13) and are left out. Amounts are the line amounts as stored.
 */
export function buildPmCanonicalLines(lines: QuoteLine[]): PmCanonicalLine[] {
  return lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => countsInTotal(l) || l.status === 'included')
    .map(({ l, i }) => {
      const id = l.id ?? fallbackLineId(l, i);
      const colour = [l.product_name, l.product_colour].filter(Boolean).join(' — ') || null;
      return {
        line_key: id,
        quote_line_id: id,
        line_label: [l.location, l.label].filter(Boolean).join(' — '),
        amount: l.status === 'included' ? 0 : (l.amount as number),
        material_key: l.material_key ?? null,
        color_name: colour,
        area_type: l.section,
        quantity: l.quantity ?? 1,
        unit_of_measure: l.unit,
        section: l.section,
        location: l.location,
        status: l.status,
      };
    });
}

// Pre-Task-11 `submission_line_items.line_key` values (written by DownstreamTrackingPanel from the engine pieces).
const LEGACY_BY_FIELD: Record<string, string> = {
  bathroom_tile_selected: 'bathroom_tile', heated_floor_bathrooms: 'heated_floor', custom_tiled_shower: 'custom_shower',
  backsplash_grout_enabled: 'grout', stair_upgrade_type: 'stair_lvp', stair_premium_carpet_selected: 'stair_carpet',
  premium_underpad_stairs: 'stair_underpad', premium_carpet_bedroom: 'bedroom_carpet', premium_underpad_bedroom: 'bedroom_underpad',
};
const LEGACY_BY_PRICE: Record<string, string> = {
  'config:additional_window_price': 'window_additional', 'config:patio_door_price': 'window_patio', 'config:automated_motor_price': 'window_automation',
};

/** The fixed legacy key a quote line used to be tracked under, or null (area/custom lines are ordinal; see below). */
export function legacyLineKey(l: QuoteLine): string | null {
  if (l.price_source_ref && LEGACY_BY_PRICE[l.price_source_ref]) return LEGACY_BY_PRICE[l.price_source_ref];
  return (l.wizard_field && LEGACY_BY_FIELD[l.wizard_field]) || null;
}

/**
 * Legacy key per canonical line, so tracking rows saved before the cutover stay attached. Each legacy key attaches to
 * the FIRST matching line only (several window lines once shared one `window_additional` row — attaching it to all
 * would multiply ordered quantities). Area upgrades (`area_upgrade:N`) and office custom items (`custom_N`) were
 * ordinal in the engine's list; they map by order of the matching lines.
 */
export function legacyKeysForLines(lines: QuoteLine[], canonical: PmCanonicalLine[]): Map<string, string> {
  const byId = new Map(lines.map((l, i) => [l.id ?? fallbackLineId(l, i), l] as const));
  const out = new Map<string, string>();
  const used = new Set<string>();
  let area = 0; let custom = 0;
  for (const c of canonical) {
    const l = byId.get(c.quote_line_id);
    if (!l) continue;
    let key = legacyLineKey(l);
    if (!key && l.wizard_field && /^area_upgrades\[[^\]]+\]$/.test(l.wizard_field)) key = `area_upgrade:${area++}`;
    if (!key && l.wizard_field?.startsWith('custom_pricing.customItems[') && countsInTotal(l)) key = `custom_${++custom}`;
    if (key && !used.has(key)) { used.add(key); out.set(c.quote_line_id, key); }
  }
  return out;
}

/** Engine-pieces canonical lines (legacy keys). Still used by DownstreamTrackingPanel until Task 18. */
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
      bedroomCarpet?: number;
      bedroomUnderpad?: number;
      bedroomCarpetSqyd?: number;
      windowAdditional: number;
      windowPatio: number;
      windowAutomation: number;
      flooringUpgrades: { areaId: string; areaName: string; materialName: string; amount: number; heatedFloorAmount: number; productName?: string; productColor?: string; sqft?: number }[];
    };
    lineItems?: { label: string; amount: number }[];
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
  // Reuse the engine's own label (carries the sq yd and the Primary Bedroom variant).
  const engineLabel = (prefix: string, fallback: string) =>
    totals.lineItems?.find(l => l.label.startsWith(prefix))?.label || fallback;
  const bedroomExtra = { area_type: 'bedroom', unit_of_measure: 'sqyd', quantity: Number(totals.pieces.bedroomCarpetSqyd) || 1 };
  push('bedroom_carpet', engineLabel('Premium Carpet — ', 'Premium Carpet — Bedrooms'), totals.pieces.bedroomCarpet || 0, {
    material_key: 'carpet', ...bedroomExtra,
  });
  push('bedroom_underpad', engineLabel('Premium Underpad — ', 'Premium Underpad — Bedrooms'), totals.pieces.bedroomUnderpad || 0, {
    material_key: 'premium_carpet_underpad', ...bedroomExtra,
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
