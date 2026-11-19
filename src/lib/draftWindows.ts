// Located windows in wizard drafts (Phase 2 Task 9). Drafts saved before the Windows step was reshaped carry only
// the three integers; on resume they get generic rows (same names the generator uses for integer-only rows), so a
// draft never loses windows. Same pattern as draftClientComments.ts. Pure; idempotent.
import { windowCounts, type QuoteWindowKind } from '@shared/quoteLines';
import { MAX_WIZARD_WINDOWS, MAX_WINDOW_LOCATION, WIZARD_WINDOW_KINDS, type WizardWindow } from '@shared/wizardWindows';

let seq = 0;
export function newWindowId(): string {
  seq += 1;
  return `w-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface WindowCountsLike { additionalWindowsQty?: unknown; patioDoorsQty?: unknown; automatedWindowsQty?: unknown }

const count = (v: unknown) => Math.max(0, Math.min(MAX_WIZARD_WINDOWS, Math.floor(Number(v) || 0)));

/**
 * Generic rows for integer-only drafts: roller shades `Additional Window N`, panel tracks `Patio Door N`; motors go on
 * patio doors first, then windows (the generator's integer rule), then on the included bedroom shades, then on
 * `Motorized Opening N`.
 */
export function synthesizeWindows(c: WindowCountsLike, includedLocations: readonly string[] = [], makeId = newWindowId): WizardWindow[] {
  const aq = count(c.additionalWindowsQty); const pq = count(c.patioDoorsQty); let mq = count(c.automatedWindowsQty);
  const patios: WizardWindow[] = Array.from({ length: pq }, (_, i) => ({
    id: makeId(), location: pq > 1 ? `Patio Door ${i + 1}` : 'Patio Door', kind: 'panel_track', motorized: false,
  }));
  const rollers: WizardWindow[] = Array.from({ length: aq }, (_, i) => ({
    id: makeId(), location: aq > 1 ? `Additional Window ${i + 1}` : 'Additional Window', kind: 'roller_5', motorized: false,
  }));
  for (const r of [...patios, ...rollers]) { if (mq > 0) { r.motorized = true; mq--; } }
  const extra: WizardWindow[] = [];
  let k = pq + aq;
  for (const loc of includedLocations) { if (mq <= 0) break; extra.push({ id: makeId(), location: loc, kind: 'included', motorized: true }); mq--; k++; }
  while (mq > 0) { k++; extra.push({ id: makeId(), location: `Motorized Opening ${k}`, kind: 'included', motorized: true }); mq--; }
  return [...rollers, ...patios, ...extra];
}

function cleanRow(r: unknown, makeId: () => string): WizardWindow | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const kind = (WIZARD_WINDOW_KINDS as readonly string[]).includes(String(o.kind)) ? o.kind as QuoteWindowKind : 'roller_5';
  return {
    id: typeof o.id === 'string' && o.id ? o.id : makeId(),
    location: String(o.location ?? '').slice(0, MAX_WINDOW_LOCATION),
    kind,
    motorized: o.motorized === true,
  };
}

/**
 * Draft selections → selections with a `windows` list and the integers derived from it. A draft that already has
 * `windows` keeps it (rows cleaned); one without gets synthesised rows from its integers.
 */
export function migrateDraftWindows<S extends WindowCountsLike & { windows?: unknown }>(
  selections: S, includedLocations: readonly string[] = [], makeId = newWindowId,
): S & { windows: WizardWindow[] } {
  const rows = Array.isArray(selections.windows)
    ? (selections.windows as unknown[]).map((r) => cleanRow(r, makeId)).filter((r): r is WizardWindow => !!r).slice(0, MAX_WIZARD_WINDOWS)
    : synthesizeWindows(selections, includedLocations, makeId);
  return { ...selections, windows: rows, ...windowCounts(rows) };
}
