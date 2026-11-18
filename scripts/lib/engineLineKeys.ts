// Keys engine lineItems to the generated quote line that must reproduce them: wizard_field + amount (+ section,
// unit price for windows, override label/ref). Used by the quote-lines parity and case tests.
import { AREA_DEFINITIONS } from '../../src/lib/upgradeCostData';
import type { QuoteLine } from '../../supabase/functions/_shared/quoteLines.ts';

interface EngineItem { group: string; label: string; amount: number }
interface KeyInput {
  areaUpgrades?: Array<{ areaId: string; materialType?: string; areaLabel?: string }> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customPricing?: any;
}
export interface ExpectedLine {
  field: string; amount: number; section?: string; unitPrice?: number; overrideKey?: string; engineLabel: string;
}

const OVERRIDE_FIELD: Record<string, string> = {
  stair: 'stair_upgrade_type', stairCarpet: 'stair_premium_carpet_selected', stairUnderpad: 'premium_underpad_stairs',
  bedroomCarpet: 'premium_carpet_bedroom', bedroomUnderpad: 'premium_underpad_bedroom', grout: 'backsplash_grout_enabled',
  bathroomTile: 'bathroom_tile_selected', heatedFloor: 'heated_floor_bathrooms', customShower: 'custom_tiled_shower',
};
const FIELD_SECTION: Record<string, string> = {
  stair_upgrade_type: 'stairs', stair_premium_carpet_selected: 'stairs', premium_underpad_stairs: 'stairs',
  premium_carpet_bedroom: 'flooring', premium_underpad_bedroom: 'flooring', backsplash_grout_enabled: 'backsplash',
  bathroom_tile_selected: 'tile', heated_floor_bathrooms: 'bathroom', custom_tiled_shower: 'bathroom',
  additional_windows_qty: 'window_coverings', patio_doors_qty: 'window_coverings', automated_windows_qty: 'window_coverings',
};
const WINDOW_FIELD: Record<string, string> = {
  'Additional Windows': 'additional_windows_qty', 'Patio Door Panel Track': 'patio_doors_qty', 'Somfy Automation': 'automated_windows_qty',
};

const areaSection = (id: string, mt: string) => id === 'stairs' ? 'stairs' : id === 'backsplash' ? 'backsplash'
  : id === 'guestBathroom' || id === 'masterEnsuite' || mt === 'tile' || mt === 'nonstandard_tile' ? 'tile' : 'flooring';

export function expectedLines(items: EngineItem[], input: KeyInput): ExpectedLine[] {
  const areas = (input.areaUpgrades || []).filter(Boolean);
  const cp = input.customPricing && typeof input.customPricing === 'object' ? input.customPricing : {};
  const overrides: Record<string, { label?: string }> = cp.overrides || {};
  const committed = (Array.isArray(cp.customItems) ? cp.customItems : [])
    .map((it: any, idx: number) => ({ it, idx }))
    .filter(({ it }: any) => it && (!it.status || it.status === 'upgrade'));
  const names = (a: { areaId: string; areaLabel?: string }) =>
    [a.areaLabel?.trim(), AREA_DEFINITIONS.find((d) => d.id === a.areaId)?.name, a.areaId].filter(Boolean) as string[];
  const areaByName = (name: string, heat: boolean) => areas.find((a) => names(a).some((n) => (heat ? n === name : name.startsWith(`${n} (`))));

  const out: ExpectedLine[] = [];
  for (const li of items) {
    const base = { amount: li.amount, engineLabel: li.label };
    if (li.group === 'custom') {
      const next = committed.shift();
      if (!next) throw new Error(`no office item for ${li.label}`);
      out.push({ ...base, field: `custom_pricing.customItems[${next.it.id || next.idx}]` });
      continue;
    }
    const overrideKey = Object.keys(OVERRIDE_FIELD).find((k) => (overrides[k]?.label || '').trim() && overrides[k]!.label!.trim() === li.label);
    if (overrideKey) { out.push({ ...base, field: OVERRIDE_FIELD[overrideKey], section: FIELD_SECTION[OVERRIDE_FIELD[overrideKey]], overrideKey }); continue; }
    if (li.group === 'window') {
      const m = li.label.match(/^(.*) \((\d+) × \$([\d.]+)\)$/);
      if (!m || !WINDOW_FIELD[m[1]]) throw new Error(`unparsed window item ${li.label}`);
      const n = Number(m[2]); const p = Number(m[3]);
      for (let i = 0; i < n; i++) out.push({ field: WINDOW_FIELD[m[1]], amount: p, unitPrice: p, section: 'window_coverings', engineLabel: li.label });
      continue;
    }
    let field: string | null = null;
    if (li.group === 'stair') field = /Stair Nosings/.test(li.label) ? 'stair_upgrade_type' : /^Premium Carpet/.test(li.label) ? 'stair_premium_carpet_selected' : /^Premium Underpad/.test(li.label) ? 'premium_underpad_stairs' : null;
    else if (li.group === 'grout') field = 'backsplash_grout_enabled';
    else if (li.group === 'bathroom') field = /Porcelain Tile Floor/.test(li.label) ? 'bathroom_tile_selected' : /^Heated Tile Floor/.test(li.label) ? 'heated_floor_bathrooms' : /Custom Tiled Shower/.test(li.label) ? 'custom_tiled_shower' : null;
    else if (li.group === 'flooring') {
      const heat = li.label.match(/^\s+└ Heated Floor \((.*)\)$/);
      if (/^Premium Carpet — /.test(li.label)) field = 'premium_carpet_bedroom';
      else if (/^Premium Underpad — /.test(li.label)) field = 'premium_underpad_bedroom';
      else if (heat) {
        const a = areaByName(heat[1], true);
        if (a) { out.push({ ...base, field: `area_upgrades[${a.areaId}].heatedFloor`, section: 'bathroom' }); continue; }
      } else {
        const a = areaByName(li.label, false);
        if (a) { out.push({ ...base, field: `area_upgrades[${a.areaId}]`, section: areaSection(a.areaId, String(a.materialType || '')) }); continue; }
      }
    }
    if (!field) throw new Error(`unkeyed engine item ${li.group}: ${li.label}`);
    out.push({ ...base, field, section: FIELD_SECTION[field] });
  }
  return out;
}

/** Matches each expected line to exactly one counted line on wizard_field AND amount (±0.005). */
export function matchByKey(expected: ExpectedLine[], lines: QuoteLine[]) {
  const pool = lines.filter((l) => l.status === 'upgrade' && l.amount != null);
  const unmatched: string[] = [];
  const wrong: string[] = [];
  for (const e of expected) {
    const i = pool.findIndex((l) => l.wizard_field === e.field && Math.abs((l.amount as number) - e.amount) < 0.005
      && (e.unitPrice === undefined || Math.abs((l.unit_price as number) - e.unitPrice) < 0.005));
    if (i < 0) { unmatched.push(`${e.field}=${e.amount} (${e.engineLabel})`); continue; }
    const l = pool.splice(i, 1)[0];
    if (e.section && l.section !== e.section) wrong.push(`${e.field}: section ${l.section} ≠ ${e.section}`);
    if (e.overrideKey) {
      if (l.label !== e.engineLabel) wrong.push(`${e.field}: label "${l.label}" ≠ override "${e.engineLabel}"`);
      if (l.pricing_mode === 'manual' && l.price_source_ref !== `override:${e.overrideKey}`)
        wrong.push(`${e.field}: price_source_ref ${l.price_source_ref}`);
    }
    if (e.unitPrice !== undefined && (l.quantity !== 1 || l.unit !== 'each')) wrong.push(`${e.field}: window line not 1 × each`);
  }
  return { unmatched, wrong, extra: pool };
}
