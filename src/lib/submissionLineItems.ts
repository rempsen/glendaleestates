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
}

export function buildCanonicalLines(
  s: BuyerSelection,
  totals: {
    pieces: {
      bathroomTile: number;
      section4HeatedFloor: number;
      customShower: number;
      grout: number;
      stairLvp: number;
      stairCarpet: number;
      windowAdditional: number;
      windowPatio: number;
      windowAutomation: number;
      flooringUpgrades: { areaId: string; areaName: string; materialName: string; amount: number; heatedFloorAmount: number }[];
    };
  },
): CanonicalLine[] {
  const out: CanonicalLine[] = [];
  const push = (k: string, l: string, a: number) => {
    if (a > 0) out.push({ line_key: k, line_label: l, amount: a });
  };
  push('bathroom_tile', 'Bathroom Tile', totals.pieces.bathroomTile);
  push('heated_floor', 'Heated Floor (Bathrooms)', totals.pieces.section4HeatedFloor);
  push('custom_shower', 'Custom Tiled Shower', totals.pieces.customShower);
  push('grout', 'Backsplash Grout', totals.pieces.grout);
  push('stair_lvp', 'Stair LVP Upgrade', totals.pieces.stairLvp);
  push('stair_carpet', 'Stair Carpet Upgrade', totals.pieces.stairCarpet);
  push('window_additional', 'Additional Windows', totals.pieces.windowAdditional);
  push('window_patio', 'Patio Doors', totals.pieces.windowPatio);
  push('window_automation', 'Window Automation', totals.pieces.windowAutomation);

  (totals.pieces.flooringUpgrades || []).forEach((u, i) => {
    out.push({
      line_key: `area_upgrade:${i}`,
      line_label: `${u.areaName} - ${u.materialName}`,
      amount: u.amount + u.heatedFloorAmount,
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
