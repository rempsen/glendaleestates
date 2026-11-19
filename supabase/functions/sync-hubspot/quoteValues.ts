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

/**
 * Money text for a CRM property: the documents' formatMoney (PDF/emails, Intl rounding) without `$` or grouping —
 * one implementation, so a CRM value can never round differently from the printed quote. (`toFixed(2)` would round
 * binary halves down: 707.175 → "707.17" where the documents print $707.18.)
 */
export const moneyText = (n: number): string => formatMoney(n).replace(/[$,]/g, '');

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

/** The HubSpot pricing property names this function writes (all from the lines). */
export const HUBSPOT_PRICING_PROPERTIES = [
  'bmd_window_total', 'bmd_window_coverings_cost', 'bmd_heated_floor_cost', 'bmd_stair_lvp_cost', 'bmd_grout_color_cost',
  'bmd_upgrade_subtotal', 'bmd_upgrade_gst', 'bmd_upgrade_grand_total', 'bmd_upgrade_breakdown',
] as const;

/**
 * The pricing properties for a contact update, or null when they must be left out: lines generated (none stored)
 * while pricing could not be loaded would price at $0 and overwrite good CRM values — the same rule the emails use
 * (no prices printed). Stored lines carry their own prices and are always sent.
 */
export function hubspotPricingProperties(
  lines: QuoteLine[], gstRate: number, opts: { linesSource: 'db' | 'generated' | 'mixed'; pricingUnavailable: string | null },
): Record<(typeof HUBSPOT_PRICING_PROPERTIES)[number], string> | null {
  if (opts.linesSource !== 'db' && opts.pricingUnavailable) return null;
  const v = hubspotQuoteValues(lines, gstRate);
  return {
    // property name unchanged for CRM history; value = sumQuoteLines(lines).windowCoverings (pre-GST)
    bmd_window_total: moneyText(v.windowTotal),
    bmd_window_coverings_cost: moneyText(v.windowCoveringsCost),
    bmd_heated_floor_cost: moneyText(v.heatedFloorCost),
    bmd_stair_lvp_cost: moneyText(v.stairLvpCost),
    bmd_grout_color_cost: moneyText(v.groutColorCost),
    bmd_upgrade_subtotal: moneyText(v.subtotal),
    bmd_upgrade_gst: moneyText(v.gst),
    bmd_upgrade_grand_total: moneyText(v.grandTotal),
    bmd_upgrade_breakdown: v.breakdown,
  };
}
