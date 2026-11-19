// `buyer_selections.custom_pricing`: the Phase 1 office pricing JSON (overrides, custom items, follow-ups). Since
// Phase 2 Task 18 it is READ-ONLY, kept for audit and read by the generator (via `customPricing` in GenerateInput)
// and by the renderers for follow-ups. Office edits live in the quote console (quote_lines). Types and the parser
// only — no pricing arithmetic here (scripts/callers.test.ts).

// Office pricing set by sales/admin. Amounts are GST-exclusive, PST included.
export type OverrideKey = 'stair' | 'grout' | 'bathroomTile' | 'heatedFloor' | 'customShower' | 'stairCarpet' | 'stairUnderpad' | 'bedroomCarpet' | 'bedroomUnderpad';
export interface PriceOverride { amount?: number | null; label?: string }
/** Phase 1 office-line status (`disputed` became `under_review` on quote lines). */
export type CustomLineStatus = 'upgrade' | 'included' | 'pending' | 'disputed' | 'deferred';
export interface CustomLineItem { id: string; label: string; detail?: string; quantity?: number | null; unit?: string; unitPrice?: number | null; amount?: number | null; catalogKey?: string; status?: CustomLineStatus; area?: string; note?: string }
export interface FollowUp { id: string; text: string; done?: boolean; clientVisible?: boolean }
export interface CustomPricing {
  overrides?: Partial<Record<OverrideKey, PriceOverride>>;
  customItems?: CustomLineItem[];
  followUps?: FollowUp[];
  /** Selection fields that are provisional, with a note shown to the client (e.g. lvp_colour). */
  provisional?: Record<string, string>;
  basementNotes?: string;
}

export function parseCustomPricing(raw: unknown): CustomPricing {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as CustomPricing;
  return { ...r, overrides: r.overrides || {}, customItems: Array.isArray(r.customItems) ? r.customItems : [], followUps: Array.isArray(r.followUps) ? r.followUps : [], provisional: r.provisional && typeof r.provisional === 'object' ? r.provisional : {} };
}
