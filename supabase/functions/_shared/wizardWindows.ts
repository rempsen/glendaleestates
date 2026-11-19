// Located windows collected by the wizard's Windows step (Phase 2 Task 9, spec §6.3).
// Dependency-free apart from ./quoteLines.ts: runs in the browser (via `@shared/*`), in edge functions and in bun tests.
import type { QuoteWindow, QuoteWindowKind } from './quoteLines.ts';

/** Most rows one submission may carry (same cap as MAX_WINDOW_QTY in the generator). */
export const MAX_WIZARD_WINDOWS = 50;
/** Longest location text kept. */
export const MAX_WINDOW_LOCATION = 80;
export const WIZARD_WINDOW_KINDS: readonly QuoteWindowKind[] = ['roller_5', 'roller_1', 'panel_track', 'included'];

/** A wizard row: a located window plus a stable id for React keys and drafts. */
export interface WizardWindow extends QuoteWindow { id: string }

export type WindowsValidation = { ok: true; windows: QuoteWindow[] | null } | { ok: false; reason: string };

/**
 * Server-side check of the client-sent `windows` array. Absent/null → ok with null (generic locations).
 * Anything malformed → not ok; the caller then ignores the list and the generator falls back to generic locations
 * (the list never changes amounts). Locations are trimmed and cut to MAX_WINDOW_LOCATION characters.
 */
export function validateWizardWindows(raw: unknown): WindowsValidation {
  if (raw === undefined || raw === null) return { ok: true, windows: null };
  if (!Array.isArray(raw)) return { ok: false, reason: 'windows is not an array' };
  if (raw.length > MAX_WIZARD_WINDOWS) return { ok: false, reason: `more than ${MAX_WIZARD_WINDOWS} windows` };
  const out: QuoteWindow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== 'object') return { ok: false, reason: `windows[${i}] is not an object` };
    const o = r as Record<string, unknown>;
    if (typeof o.kind !== 'string' || !(WIZARD_WINDOW_KINDS as readonly string[]).includes(o.kind)) {
      return { ok: false, reason: `windows[${i}].kind is not allowed` };
    }
    if (o.location !== undefined && o.location !== null && typeof o.location !== 'string') {
      return { ok: false, reason: `windows[${i}].location is not a string` };
    }
    out.push({
      location: String(o.location ?? '').trim().slice(0, MAX_WINDOW_LOCATION),
      kind: o.kind as QuoteWindowKind,
      motorized: o.motorized === true,
    });
  }
  return { ok: true, windows: out };
}

/** Strip ids (and anything else) for the generator / request body. */
export const toQuoteWindows = (rows: readonly QuoteWindow[]): QuoteWindow[] =>
  rows.map((w) => ({ location: w.location, kind: w.kind, motorized: !!w.motorized }));
