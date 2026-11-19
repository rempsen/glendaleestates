// HubSpot pricing properties from quote lines (Phase 2 Task 11). Pure; every figure is sumQuoteLines over the lines
// (or over a filtered subset of them), never a price constant. Property names are unchanged for CRM history.
import { countsInTotal, sumQuoteLines, type QuoteLine } from "../_shared/quoteLines.ts";
import { formatMoney } from "../_shared/lineRenderRows.ts";
import { toBuyerWording } from "../_shared/buyerWording.ts";

export interface HubspotQuoteValues {
  /** `bmd_window_total`: pre-GST window coverings (sumQuoteLines().windowCoverings). */
  windowTotal: number;
  windowCoveringsCost: number;
  heatedFloorCost: number;
  stairLvpCost: number;
  groutColorCost: number;
  subtotal: number;
  gst: number;
  grandTotal: number;
  breakdown: string;
}

const subtotalOf = (lines: QuoteLine[], gstRate: number, pick: (l: QuoteLine) => boolean) =>
  sumQuoteLines(lines.filter(pick), gstRate).subtotal;

export function hubspotQuoteValues(lines: QuoteLine[], gstRate: number): HubspotQuoteValues {
  const live = lines.filter((l) => l.status !== 'removed');
  const sums = sumQuoteLines(live, gstRate);
  const counted = live.filter(countsInTotal);
  const breakdown = counted.length
    ? `${counted.map((l) => `${toBuyerWording([l.location, l.label].filter(Boolean).join(' — '))}: ${formatMoney(l.amount as number)}`).join('; ')}`
      + ` | Subtotal: ${formatMoney(sums.subtotal)} + GST: ${formatMoney(sums.gst)} = Total: ${formatMoney(sums.total)}`
    : 'No upgrades selected';
  return {
    windowTotal: sums.windowCoverings,
    windowCoveringsCost: sums.windowCoverings,
    heatedFloorCost: subtotalOf(live, gstRate, (l) => l.price_source_ref === 'config:heated_floor_per_bathroom'),
    stairLvpCost: subtotalOf(live, gstRate, (l) => l.section === 'stairs' && l.wizard_field === 'stair_upgrade_type'),
    groutColorCost: subtotalOf(live, gstRate, (l) => l.wizard_field === 'backsplash_grout_enabled'),
    subtotal: sums.subtotal,
    gst: sums.gst,
    grandTotal: sums.total,
    breakdown,
  };
}
