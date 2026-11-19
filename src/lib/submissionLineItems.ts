// =====================================================================
// Canonical line-key generator for downstream tracking.
// A "line" is anything that can be approved / procured / installed.
// Keys are stable so submission_line_items rows can be joined across
// re-exports and edits.
// =====================================================================

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


/** True for a PM line that has no stored quote line yet (generator fallback): it cannot carry tracking. */
export const isGeneratedLineKey = (key: string): boolean => key.startsWith('generated:');

/**
 * Which `submission_line_items.line_key` the tracking panel reads and writes for a canonical line: an existing row
 * under the quote_line_id (new rows), else an existing row under the line's legacy key (saved before the cutover;
 * kept so it is updated, not duplicated), else the quote_line_id. Lines not yet stored (`generated:` ids) are
 * read-only (tracking must hang off a stored line, so staff save the quote first) but still show a legacy row.
 */
export function trackingKeyFor(
  cl: Pick<PmCanonicalLine, 'quote_line_id'>, legacyKey: string | undefined, existing: ReadonlySet<string> | Record<string, unknown>,
): { key: string; editable: boolean } {
  const has = (k: string) => (existing instanceof Set ? existing.has(k) : Object.prototype.hasOwnProperty.call(existing, k));
  // Not stored yet (before the backfill): tracking saved before the cutover still shows, read-only, by legacy key.
  if (isGeneratedLineKey(cl.quote_line_id)) {
    return { key: legacyKey && has(legacyKey) ? legacyKey : cl.quote_line_id, editable: false };
  }
  if (has(cl.quote_line_id)) return { key: cl.quote_line_id, editable: true };
  if (legacyKey && has(legacyKey)) return { key: legacyKey, editable: true };
  return { key: cl.quote_line_id, editable: true };
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
