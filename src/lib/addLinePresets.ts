// Add-line presets for the meeting console (Phase 2 Task 8, spec §6.10). Pure: a pricing source in, a new-line draft out.
// Every number comes from the source (upgrade_materials / pricing_config / unit_area_data via useDynamicPricing);
// this file holds keys and wording only — scripts/add-line-presets.test.ts fails on any numeric literal here.
import { markedUp, type LineStatus, type LineUnit, type PricingMode, type QuoteLine, type Section } from '@/lib/quoteLines';
import { lineAmount } from '@/lib/lineAmount';
import { AREA_DEFINITIONS } from '@/lib/upgradeCostData';
import type { useDynamicPricing } from '@/hooks/useDynamicPricing';

export interface PresetMaterial { key: string; name: string; costPerUnit: number; unit: 'sqft' | 'sqyd' | 'flat' }
export interface PresetConfigRow { config_key: string; config_value: number; is_active: boolean }
export interface PresetSource {
  /** Fraction (0.6 = 60 %), as useDynamicPricing returns it. */
  markupPercentage: number;
  /** Active upgrade_materials rows. */
  materials: PresetMaterial[];
  /** pricing_config rows. */
  config: PresetConfigRow[];
  /** The unit's areas (getUnitAreaData(code)); null when the unit type is unknown. */
  unitAreas: Record<string, number | undefined> | null;
}

/**
 * The part of `useDynamicPricing()` the presets read, typed from the hook itself so `tsc` fails if the hook stops
 * returning it (type-only import: nothing from the hook runs here).
 */
export type DynamicPresetInput = Pick<ReturnType<typeof useDynamicPricing>, 'markupPercentage' | 'materials' | 'config' | 'getUnitAreaData'>;

export function presetSourceFromDynamic(dyn: DynamicPresetInput, unitTypeCode: string | null): PresetSource {
  return {
    markupPercentage: dyn.markupPercentage,
    materials: dyn.materials.filter((m) => m.is_active !== false).map((m) => ({
      key: m.material_key, name: m.name, costPerUnit: Number(m.cost_per_unit),
      unit: m.unit_type === 'sqyd' || m.unit_type === 'flat' ? m.unit_type : 'sqft',
    })),
    config: dyn.config.map((c) => ({ config_key: c.config_key, config_value: Number(c.config_value), is_active: c.is_active !== false })),
    unitAreas: unitTypeCode ? ((dyn.getUnitAreaData(unitTypeCode) as Record<string, number | undefined> | null) ?? null) : null,
  };
}

/** Fields of a new office line (structurally a `NewLineInput` for useQuoteLines.createLine). */
export type LineDraft = Pick<QuoteLine,
  'section' | 'location' | 'label' | 'product_name' | 'product_colour' | 'material_key' | 'quantity' | 'unit' |
  'unit_price' | 'amount' | 'pricing_mode' | 'price_source_ref' | 'status' | 'client_visible' | 'source' |
  'flagged_to' | 'provisional'>;
export type PresetResult = LineDraft | { error: string };

export const SECTION_LABELS: Record<Section, string> = {
  standard: 'Standard inclusions', flooring: 'Flooring', tile: 'Tile', backsplash: 'Backsplash', stairs: 'Stairs',
  window_coverings: 'Window coverings', bathroom: 'Bathroom', basement: 'Basement', other: 'Other',
};

/** Flat-rate presets: a pricing_config key, its wording and unit. Prices are read from the config row. */
export interface FlatRatePreset { key: string; label: string; unit: Extract<LineUnit, 'each' | 'flat'>; section: Section }
export const FLAT_RATE_PRESETS: readonly FlatRatePreset[] = [
  { key: 'additional_window_price', label: 'Additional window covering', unit: 'each', section: 'window_coverings' },
  { key: 'patio_door_price', label: 'Patio door covering', unit: 'each', section: 'window_coverings' },
  { key: 'automated_motor_price', label: 'Motorization', unit: 'each', section: 'window_coverings' },
  { key: 'heated_floor_per_bathroom', label: 'Heated floor', unit: 'each', section: 'bathroom' },
  { key: 'stair_lvp_upgrade_price', label: 'Stair LVP upgrade', unit: 'flat', section: 'stairs' },
  { key: 'stair_premium_lvp_upgrade_price', label: 'Stair premium LVP upgrade', unit: 'flat', section: 'stairs' },
  { key: 'grout_color_change_price', label: 'Grout colour change', unit: 'flat', section: 'backsplash' },
];

const clean = (s: string | null | undefined) => (s ?? '').trim();
const base = (section: Section, location: string, label: string): Pick<LineDraft,
  'section' | 'location' | 'label' | 'client_visible' | 'source' | 'flagged_to' | 'provisional' | 'product_name' |
  'product_colour' | 'material_key'> => ({
  section, location: clean(location), label: clean(label) || SECTION_LABELS[section],
  client_visible: true, source: 'office', flagged_to: null, provisional: false,
  product_name: null, product_colour: null, material_key: null,
});
const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

// ---- Options for the pickers ----

export const catalogOptions = (src: PresetSource): PresetMaterial[] => src.materials;

/** Premium underpad is laid under carpet: it takes the carpet areas (as the generator prices it on bedroom carpet). */
const AREA_MATERIAL_ALIAS: Record<string, string> = { premium_carpet_underpad: 'carpet' };

/** Whether a measured area can take a material: same unit (sqft vs sqyd) and listed in the area's upgrade types. */
function areaFits(areaId: string, m: PresetMaterial): boolean {
  const def = AREA_DEFINITIONS.find((a) => a.id === areaId);
  if (!def || def.unit !== m.unit) return false;
  const types = def.upgradeTypes as readonly string[];
  return types.includes(m.key) || types.includes(AREA_MATERIAL_ALIAS[m.key] ?? '');
}

/**
 * Measured areas for the unit (quantity > 0). With a material, only areas in the material's unit whose upgrade
 * types include it — a per-sqyd carpet never takes a sqft area.
 */
export function areaOptions(src: PresetSource, materialKey?: string | null): Array<{ areaId: string; label: string; quantity: number }> {
  if (!src.unitAreas) return [];
  const m = materialKey ? src.materials.find((x) => x.key === materialKey) : undefined;
  if (materialKey && (!m || m.unit === 'flat')) return [];
  return Object.entries(src.unitAreas)
    .filter((e): e is [string, number] => isNum(e[1]) && e[1] > 0)
    .filter(([areaId]) => !m || areaFits(areaId, m))
    .map(([areaId, quantity]) => ({ areaId, quantity, label: AREA_DEFINITIONS.find((a) => a.id === areaId)?.name ?? areaId }));
}

const activeConfig = (src: PresetSource, key: string): PresetConfigRow | undefined =>
  src.config.find((c) => c.config_key === key && c.is_active && isNum(c.config_value));

export function flatRateOptions(src: PresetSource): Array<FlatRatePreset & { price: number }> {
  return FLAT_RATE_PRESETS.flatMap((p) => {
    const row = activeConfig(src, p.key);
    return row ? [{ ...p, price: row.config_value }] : [];
  });
}

// ---- Line builders ----

/** Material from upgrade_materials × (1 + markup); quantity from unit_area_data when an area is picked. */
export function catalogLine(src: PresetSource, input: {
  section: Section; materialKey: string; areaId?: string | null; location: string; quantity?: number | null;
  productName?: string | null; productColour?: string | null;
}): PresetResult {
  const m = src.materials.find((x) => x.key === input.materialKey);
  if (!m || !isNum(m.costPerUnit)) return { error: `Material "${input.materialKey}" is not in Pricing Control.` };
  let quantity: number | null = isNum(input.quantity) ? input.quantity : null;
  if (m.unit === 'flat') {
    if (input.areaId) return { error: `${m.name} is a flat price; it does not take an area.` };
    quantity = quantity ?? 1;
  } else if (input.areaId) {
    if (!areaFits(input.areaId, m)) return { error: `${m.name} (${m.unit}) cannot be priced on that area.` };
    const area = areaOptions(src, m.key).find((a) => a.areaId === input.areaId);
    if (!area) return { error: 'That area has no measured size for this unit type.' };
    quantity = area.quantity;
  }
  const unitPrice = markedUp(m.costPerUnit, src.markupPercentage);
  return {
    ...base(input.section, input.location, m.name),
    product_name: clean(input.productName) || null, product_colour: clean(input.productColour) || null,
    material_key: m.key, quantity, unit: m.unit, unit_price: unitPrice, amount: lineAmount(quantity, unitPrice, null),
    pricing_mode: 'catalog', price_source_ref: `material:${m.key}`, status: 'upgrade',
  };
}

/** A pricing_config flat rate (no markup, as the engines charge it). */
export function flatRateLine(src: PresetSource, input: {
  section: Section; configKey: string; location: string; quantity?: number | null; label?: string;
}): PresetResult {
  const preset = FLAT_RATE_PRESETS.find((p) => p.key === input.configKey);
  if (!preset) return { error: `"${input.configKey}" is not a flat-rate price.` };
  const row = activeConfig(src, preset.key);
  if (!row) return { error: `${preset.label} is switched off in Pricing Control.` };
  const quantity = isNum(input.quantity) ? input.quantity : 1;
  return {
    ...base(input.section, input.location, clean(input.label) || preset.label),
    quantity, unit: preset.unit, unit_price: row.config_value, amount: lineAmount(quantity, row.config_value, null),
    pricing_mode: 'flat_rate', price_source_ref: `config:${preset.key}`, status: 'upgrade',
  };
}

/** Staff-typed price: qty × unit price, or a typed amount. Nothing typed → amount null. */
export function manualLine(input: {
  section: Section; location: string; label: string; unit: LineUnit;
  quantity?: number | null; unitPrice?: number | null; amount?: number | null;
  productName?: string | null; productColour?: string | null;
}): LineDraft {
  const quantity = isNum(input.quantity) ? input.quantity : null;
  const unitPrice = isNum(input.unitPrice) ? input.unitPrice : null;
  return {
    ...base(input.section, input.location, input.label),
    product_name: clean(input.productName) || null, product_colour: clean(input.productColour) || null,
    quantity, unit: input.unit, unit_price: unitPrice, amount: lineAmount(quantity, unitPrice, input.amount),
    pricing_mode: 'manual', price_source_ref: null, status: 'upgrade',
  };
}

/** Standard inclusion: status included, amount 0. */
export function includedLine(input: { section: Section; location: string; label: string; productName?: string | null; productColour?: string | null }): LineDraft {
  return {
    ...base(input.section, input.location, input.label),
    product_name: clean(input.productName) || null, product_colour: clean(input.productColour) || null,
    quantity: null, unit: 'flat', unit_price: null, amount: 0, pricing_mode: 'included' as PricingMode, price_source_ref: null,
    status: 'included' as LineStatus,
  };
}

/** Request pricing: a pending line with no amount, flagged to the person who will price it. */
export function pendingLine(input: { section: Section; location: string; label: string; flaggedTo?: string | null; unit?: LineUnit }): LineDraft {
  return {
    ...base(input.section, input.location, input.label),
    quantity: null, unit: input.unit ?? 'each', unit_price: null, amount: null, pricing_mode: 'manual', price_source_ref: null,
    status: 'pending', flagged_to: input.flaggedTo ?? null,
  };
}

// ---- Defaults ----

/** First base-spec location of the section ('' when the section has none). */
export function defaultLocation(section: Section, baseSpec: ReadonlyArray<{ section: string; location: string }>): string {
  return baseSpec.find((r) => r.section === section)?.location ?? '';
}

export interface PresetPerson { user_id: string; name: string; email: string | null }

/** staff_directory() rows → people for the Flag-to picker: one per user (admin and staff rows merged), by name. */
export function peopleFromDirectory(
  rows: ReadonlyArray<{ user_id: string; email: string | null; first_name: string | null; last_name: string | null }>,
): PresetPerson[] {
  const byId = new Map<string, PresetPerson>();
  for (const r of rows) {
    if (byId.has(r.user_id)) continue;
    const name = [r.first_name, r.last_name].map((x) => (x ?? '').trim()).filter(Boolean).join(' ') || r.email || 'Staff member';
    byId.set(r.user_id, { user_id: r.user_id, name, email: r.email });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who prices a section by default (controller ruling): window coverings → Dan, flooring / tile / stairs / basement →
 * Brian. Matched by email local part or first name, and only among people whose email is on the
 * internal_notification_recipients list; no list, no match → no default (staff pick).
 */
const SECTION_PRICER: Partial<Record<Section, string>> = {
  window_coverings: 'dan', flooring: 'brian', tile: 'brian', stairs: 'brian', basement: 'brian',
};

export function defaultAssignee(section: Section, people: PresetPerson[], recipients: string[] | null): string | null {
  const handle = SECTION_PRICER[section];
  if (!handle || !recipients?.length) return null;
  const listed = new Set(recipients.map((e) => e.trim().toLowerCase()));
  const hit = people.find((p) => {
    const email = (p.email ?? '').trim().toLowerCase();
    if (!email || !listed.has(email)) return false;
    return email.split('@')[0] === handle || p.name.trim().toLowerCase().split(/\s+/)[0] === handle;
  });
  return hit?.user_id ?? null;
}
