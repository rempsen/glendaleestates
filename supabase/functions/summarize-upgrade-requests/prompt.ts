// Pure prompt builder for summarize-upgrade-requests (spec §6.15, invariant P3). No I/O, no imports beyond promptSafety.
// WHITELIST, not blacklist: only the fields named below ever reach the model. Staff-only text (quote_lines.internal_note,
// sales_comments, admin_notes, area `comments`, area `manualPriceNote`, custom_pricing item `note`, `basementNotes`,
// internal follow-ups) is never read, so a new staff-only column cannot leak by default.
// Buyer free text is wrapped by delimitUntrusted; every other string is cleaned with cleanScalar (no links, markup or
// delimiter lookalikes). Output is byte-stable for a given input (golden tests: scripts/fixtures/ai-golden/).
import { cleanScalar, delimitUntrusted, stripUnsafe, untrustedPreamble } from '../_shared/promptSafety.ts';

type Row = Record<string, unknown>;
export type SummaryPromptInput = {
  selection: Row;
  /**
   * submission_audit_logs rows, newest first: created_at, action_type, changed_by ('buyer' | 'staff' | 'unknown', see
   * actorFor), change_summary, changes. Emails and user ids are never read.
   */
  changeLog: Row[];
  /** quote_lines rows in sort order (status 'removed' already excluded by the loader). */
  lines: Row[];
  /** quote_line_reviews rows, newest first: line_id, response, comment, created_at. */
  reviews: Row[];
};
export type SummaryPrompt = { instructions: string; input: string };

/** Structured (non-free-text) buyer_selections fields. */
export const SELECTION_FIELDS = [
  'unit_number', 'unit_type', 'status', 'created_at', 'updated_at', 'has_stairs', 'lvp_colour', 'spc_tile_colour',
  'backsplash_orientation', 'backsplash_grout_enabled', 'backsplash_grout_color', 'stair_upgrade_type',
  'stair_lvp_upgrade_selected', 'stair_premium_carpet_selected', 'premium_underpad_stairs', 'stair_carpet_colour',
  'bedroom_flooring_choice', 'bedroom_carpet_colour', 'premium_carpet_bedroom', 'premium_underpad_bedroom',
  'additional_windows_qty', 'patio_doors_qty', 'automated_windows_qty', 'bathroom_tile_selected',
  'heated_floor_bathrooms', 'custom_tiled_shower', 'hardwood_upgrade_selected', 'upgrade_interests',
] as const;
/** Buyer-typed free text on buyer_selections: always delimited. */
export const SELECTION_BUYER_TEXT = [
  'upgrade_comments', 'upgrade_interests_notes', 'lvp_comments', 'spc_tile_comments', 'window_comments', 'backsplash_grout_comments',
] as const;
/** Every buyer_selections column the loader may select (and nothing else). */
export const SELECTION_SELECT = [...SELECTION_FIELDS, ...SELECTION_BUYER_TEXT, 'area_upgrades', 'custom_pricing'] as const;
const CHANGE_FIELDS = [
  ...SELECTION_FIELDS, 'bedroom_lvp_colour', 'bedroom_lvp_same_as_main', 'upgrade_floor_selection', 'estimated_possession_date',
] as const;
const AREA_FIELDS = ['areaId', 'areaLabel', 'materialType', 'productName', 'productColor', 'heatedFloor', 'manualPrice'] as const;
/** quote_lines columns the loader may select; internal_note is deliberately absent. */
export const LINE_SELECT = [
  'id', 'section', 'location', 'label', 'product_name', 'product_colour', 'material_key', 'quantity', 'unit', 'unit_price',
  'amount', 'pricing_mode', 'status', 'client_visible', 'source', 'provisional', 'client_note',
] as const;
const LINE_FIELDS = [
  'section', 'location', 'label', 'product_name', 'product_colour', 'material_key', 'quantity', 'unit', 'unit_price', 'amount',
  'pricing_mode', 'status', 'client_visible', 'source', 'provisional',
] as const;
const CUSTOM_ITEM_FIELDS = ['label', 'detail', 'area', 'quantity', 'unit', 'unitPrice', 'amount', 'status'] as const;
const MAX_ITEMS = 100;

export type Actor = 'buyer' | 'staff' | 'unknown';
const ACTORS: readonly Actor[] = ['buyer', 'staff', 'unknown'];
/** user_roles rows → ids that count as staff for change-log labels (same roles as public.is_staff). Not an auth check. */
export function staffIdsFromRoles(rows: unknown): Set<string> {
  const staffRoles = new Set(['admin', 'staff']);
  return new Set((Array.isArray(rows) ? rows : [])
    .filter(r => isObj(r) && typeof r.user_id === 'string' && staffRoles.has(String(r.role)))
    .map(r => (r as Row).user_id as string));
}

/** Who made a change, from changed_by_user_id: staff (admin/staff role) first, then the submission's buyer. */
export function actorFor(userId: unknown, ctx: { staffUserIds: ReadonlySet<string>; buyerUserIds: ReadonlySet<string> }): Actor {
  const id = typeof userId === 'string' ? userId : '';
  if (id && ctx.staffUserIds.has(id)) return 'staff';
  if (id && ctx.buyerUserIds.has(id)) return 'buyer';
  return 'unknown';
}

const isObj = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

/** Deep-clean an arbitrary structured value: strings cleaned, keys cleaned, bounded depth and length. */
function cleanDeep(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return cleanScalar(v);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (depth >= 4) return '[omitted]';
  if (Array.isArray(v)) return v.slice(0, MAX_ITEMS).map(x => cleanDeep(x, depth + 1));
  if (isObj(v)) {
    const out: Row = {};
    for (const [k, val] of Object.entries(v).slice(0, MAX_ITEMS)) out[cleanScalar(k, 60)] = cleanDeep(val, depth + 1);
    return out;
  }
  return null;
}

function pick(src: unknown, keys: readonly string[]): Row {
  const out: Row = {};
  if (!isObj(src)) return out;
  for (const k of keys) if (src[k] !== undefined) out[k] = cleanDeep(src[k]);
  return out;
}

/** A delimited block, or nothing when the cleaned text is empty. */
const block = (label: string, text: unknown): string[] => (stripUnsafe(text) ? [delimitUntrusted(label, text)] : []);

function areaRows(raw: unknown, prefix: string): { rows: Row[]; rowBlocks: string[][]; blocks: string[] } {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_ITEMS) : [];
  const rows = list.map(r => pick(r, AREA_FIELDS));
  const rowBlocks = list.map((r, i) => block(`${prefix}[${i}].clientComment`, isObj(r) ? r.clientComment : null));
  return { rows, rowBlocks, blocks: rowBlocks.flat() };
}

function customPricingForAi(raw: unknown): Row | null {
  if (!isObj(raw)) return null;
  const out: Row = {};
  if (isObj(raw.overrides)) {
    const o: Row = {};
    for (const [k, v] of Object.entries(raw.overrides).slice(0, MAX_ITEMS)) o[cleanScalar(k, 60)] = pick(v, ['amount', 'label']);
    out.overrides = o;
  }
  if (Array.isArray(raw.customItems)) out.customItems = raw.customItems.slice(0, MAX_ITEMS).map(i => pick(i, CUSTOM_ITEM_FIELDS));
  if (Array.isArray(raw.followUps)) {
    out.clientFollowUps = raw.followUps
      .filter(f => isObj(f) && f.clientVisible === true && !f.done)
      .slice(0, MAX_ITEMS)
      .map(f => cleanScalar((f as Row).text));
  }
  if (isObj(raw.provisional)) out.provisional = cleanDeep(raw.provisional);
  return out;
}

function lineForAi(row: unknown, ref: string, prefix: string): { line: Row; blocks: string[] } {
  const line = pick(row, LINE_FIELDS);
  const r = isObj(row) ? row : {};
  const blocks: string[] = [];
  if (r.source === 'buyer_request' && r.label !== undefined) {
    line.label = '(buyer text, see block)';
    blocks.push(...block(`${prefix}.label`, r.label));
  }
  blocks.push(...block(`${prefix}.client_note`, r.client_note));
  return { line: ref ? { line: ref, ...line } : line, blocks };
}

function changeEntry(log: Row, ref: string, lineRefs: Map<string, { ref: string; source: unknown }>): string[] {
  const head: Row = pick(log, ['created_at', 'action_type']);
  head.changed_by = ACTORS.includes(log.changed_by as Actor) ? log.changed_by : 'unknown';
  if (log.change_summary !== undefined) head.change_summary = cleanDeep(log.change_summary);
  const blocks: string[] = [];
  const changes = isObj(log.changes) ? log.changes : {};
  const action = typeof log.action_type === 'string' ? log.action_type : '';
  const out: Row = {};
  if (action.startsWith('quote_line_')) {
    const known = lineRefs.get(String(changes.line_id ?? ''));
    out.line = known ? known.ref : '(line no longer on the quote)';
    for (const side of ['old', 'new'] as const) {
      const v = changes[side];
      if (!isObj(v)) { out[side] = null; continue; }
      const source = v.source ?? known?.source;
      const { line, blocks: b } = lineForAi({ ...v, source }, '', `change_log[${ref}].${side}`);
      if (v.source === undefined) delete line.source;
      out[side] = line;
      blocks.push(...b);
    }
  } else {
    for (const [key, diff] of Object.entries(changes)) {
      const d = isObj(diff) ? diff : {};
      if ((CHANGE_FIELDS as readonly string[]).includes(key)) {
        out[key] = { old: cleanDeep(d.old), new: cleanDeep(d.new) };
      } else if ((SELECTION_BUYER_TEXT as readonly string[]).includes(key)) {
        out[key] = '(buyer text, see blocks)';
        blocks.push(...block(`change_log[${ref}].${key}.old`, d.old), ...block(`change_log[${ref}].${key}.new`, d.new));
      } else if (key === 'area_upgrades') {
        const o = areaRows(d.old, `change_log[${ref}].area_upgrades.old`);
        const n = areaRows(d.new, `change_log[${ref}].area_upgrades.new`);
        out[key] = { old: o.rows, new: n.rows };
        blocks.push(...o.blocks, ...n.blocks);
      } else if (key === 'custom_pricing') {
        out[key] = { old: customPricingForAi(d.old), new: customPricingForAi(d.new) };
      }
    }
  }
  return [`[${ref}] ${JSON.stringify({ ...head, changes: out })}`, ...blocks];
}

const INSTRUCTIONS = `You help condo finishing staff review buyer upgrade requests.
Summarize for staff in plain, concise English (no emojis):
1. "New / recent requests" — changes from the change log and buyer line reviews, newest first, with dates. Clearly call out any buyer-added lower-level stair carpet or underpad upgrade (stairs from main level to basement/lower level).
2. "Current upgrades" — short bullet list of every upgrade currently selected (flooring area upgrades with product/colour, bathroom, shower, heated floors, backsplash/grout, stairs, window coverings, quote lines, office custom line items and office prices).
3. "Needs staff attention" — anything unclear, conflicting, missing a colour, questioned by the buyer, or mentioned only in comments.
Do not invent prices; only mention prices that appear in the data (office prices and line amounts are GST-exclusive). Use short bullets under each heading.

`;

const section = (title: string, body: string[]) => `${title}:\n${body.length ? body.join('\n') : '(none)'}`;

/** Build the model request text: `instructions` (system) and `input` (data only). */
export function buildSummaryPrompt(input: SummaryPromptInput): SummaryPrompt {
  const sel = isObj(input.selection) ? input.selection : {};
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, MAX_ITEMS);
  const reviews = (Array.isArray(input.reviews) ? input.reviews : []).slice(0, MAX_ITEMS);
  const logs = (Array.isArray(input.changeLog) ? input.changeLog : []).slice(0, MAX_ITEMS);

  const comments = SELECTION_BUYER_TEXT.flatMap(k => block(k, sel[k]));
  const areas = areaRows(sel.area_upgrades, 'area_upgrades');
  const areaBody = areas.rows.flatMap((r, i) => [`[A${i + 1}] ${JSON.stringify(r)}`, ...areas.rowBlocks[i]]);
  const pricing = customPricingForAi(sel.custom_pricing);

  const lineRefs = new Map<string, { ref: string; source: unknown }>();
  const lineBody = lines.flatMap((row, i) => {
    const ref = `L${i + 1}`;
    if (isObj(row) && row.id !== undefined) lineRefs.set(String(row.id), { ref, source: row.source });
    const { line, blocks } = lineForAi(row, '', `quote_lines[${ref}]`);
    return [`[${ref}] ${JSON.stringify(line)}`, ...blocks];
  });
  const reviewBody = reviews.flatMap((rv, i) => {
    const ref = `R${i + 1}`;
    const r = isObj(rv) ? rv : {};
    const head = { line: lineRefs.get(String(r.line_id ?? ''))?.ref ?? '(line no longer on the quote)', ...pick(r, ['response', 'created_at']) };
    return [`[${ref}] ${JSON.stringify(head)}`, ...block(`reviews[${ref}].comment`, r.comment)];
  });
  const logBody = logs.flatMap((l, i) => changeEntry(isObj(l) ? l : {}, `C${i + 1}`, lineRefs));

  const text = [
    section('SELECTION RECORD', [JSON.stringify(pick(sel, SELECTION_FIELDS))]),
    section('BUYER COMMENTS', comments),
    section('AREA UPGRADES', areaBody),
    section('OFFICE PRICING (GST-exclusive)', pricing ? [JSON.stringify(pricing)] : []),
    section('QUOTE LINES', lineBody),
    section('BUYER LINE REVIEWS (newest first)', reviewBody),
    section('CHANGE LOG (newest first)', logBody),
  ].join('\n\n');

  return { instructions: INSTRUCTIONS + untrustedPreamble(), input: text };
}
