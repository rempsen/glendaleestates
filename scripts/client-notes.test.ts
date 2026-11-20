// Client-facing notes (buyer PDF "Your Comments & Notes"): one definition shared by the PDF and the staff panel, and
// one narrow writer (src/lib/clientNotes.ts) that may change only the six comment columns and area `clientComment`.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import {
  applyAreaClientComment, areaClientCommentEdits, BuyerDetailsPartialSaveError, clientNoteRows, CLIENT_NOTE_COLUMNS, CLIENT_NOTE_FIELDS, CLIENT_NOTES_CONFLICT_MESSAGE,
  ClientNotesConflictError, clientNoteEntries, clientNoteSourceFromSelections, isClientNotesConflict, saveBuyerDetailsEdit,
  saveClientNotes,
} from '../src/lib/clientNotes';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { clientAreaNotes } from '../src/lib/areaNotes';
import { AREA_DEFINITIONS } from '../src/lib/upgradeCostData';
import { toBuyerWording } from '../src/lib/outputLabels';
import { buildSubmissionUpdatePayload, PRICING_FIELDS, type SubmissionEditState } from '../src/lib/submissionUpdatePayload';
import { auditActionLabel, auditChangeRows } from '../src/lib/auditDisplay';
import type { Tables } from '../src/integrations/supabase/types';

const ROOT = join(import.meta.dir, '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
type Row = Record<string, unknown> & { id: string; unit_number: string; area_upgrades: unknown; updated_at: string };
const fixtures = liveSubmissions as unknown as Row[];
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Each fixture with every client note filled in (plus unspecified / unknown area ids), so all label paths run. */
const withNotes = (row: Row): Row => {
  const areas = (Array.isArray(row.area_upgrades) ? clone(row.area_upgrades) : []) as Array<Record<string, unknown>>;
  areas.forEach((a, i) => { if (i % 2 === 0) a.clientComment = `  Note for ${String(a.areaId)}  `; a.comments = 'INTERNAL area note'; });
  areas.push({ areaId: 'unspecified_area_2', materialType: 'lvp', clientComment: 'Unspecified area note', comments: 'x' });
  areas.push({ areaId: 'mysteryRoom', materialType: 'tile', clientComment: 'Mystery note' });
  areas.push({ areaId: '', materialType: 'tile', clientComment: '   ' });
  return {
    ...clone(row), lvp_comments: 'LVP note', spc_tile_comments: 'Tile note', window_comments: 'Window note',
    backsplash_grout_comments: 'Grout note', upgrade_interests_notes: 'Interests note', upgrade_comments: 'Summary note',
    sales_comments: 'PRIVATE sales', admin_notes: 'PRIVATE admin', area_upgrades: areas,
  };
};

/** The PDF's entries exactly as buyerPdfGenerator built them before this change (frozen copy, for the pin). */
function legacyPdfEntries(selections: ReturnType<typeof toBuyerPdfSelections>): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  if (selections.lvpComments) out.push({ label: 'Main Floor LVP', text: selections.lvpComments });
  if (selections.spcTileComments) out.push({ label: 'Bathroom Tile', text: selections.spcTileComments });
  if (selections.windowComments) out.push({ label: 'Window Coverings', text: selections.windowComments });
  if (selections.backsplashGrout?.comments) out.push({ label: 'Backsplash Grout', text: selections.backsplashGrout.comments });
  if (selections.upgradeInterestsNotes) out.push({ label: 'Upgrade Interests', text: selections.upgradeInterestsNotes });
  if (selections.upgradeComments) out.push({ label: 'Upgrade Pricing Summary', text: selections.upgradeComments });
  const areaNoteLabel = (u: { areaId: string }, idx: number) => {
    const areaDef = AREA_DEFINITIONS.find(a => a.id === u.areaId);
    if (areaDef) return `Area Upgrade — ${toBuyerWording(areaDef.name)}`;
    if (!u.areaId || u.areaId.startsWith('unspecified_area')) return `Area Upgrade — Unspecified Area #${idx + 1}`;
    return `Area Upgrade — ${u.areaId}`;
  };
  clientAreaNotes(selections.areaUpgrades).forEach(n => out.push({ label: areaNoteLabel(n, n.index), text: n.text }));
  return out;
}
const labelText = (es: Array<{ label: string; text: string }>) => es.map(({ label, text }) => ({ label, text }));

describe('clientNoteEntries is the PDF definition', () => {
  test('nine fixtures: as stored and with every note filled — PDF rows unchanged, row and PDF paths agree', () => {
    expect(fixtures).toHaveLength(9);
    for (const base of fixtures) {
      for (const row of [base, withNotes(base)]) {
        const selections = toBuyerPdfSelections(row as unknown as Tables<'buyer_selections'>);
        const legacy = legacyPdfEntries(selections);
        expect(labelText(clientNoteEntries(clientNoteSourceFromSelections(selections)))).toEqual(legacy);
        expect(labelText(clientNoteEntries(row))).toEqual(legacy);
      }
    }
  });
  test('the filled fixture prints all six fields in PDF order, area labels by the PDF rules, and nothing internal', () => {
    const row = withNotes(fixtures.find(r => r.unit_number === '24')!);
    const entries = clientNoteEntries(row);
    expect(entries.slice(0, 6).map(e => e.label)).toEqual(CLIENT_NOTE_FIELDS.map(f => f.label));
    expect(entries.map(e => e.label)).toContain('Area Upgrade — Unspecified Area #4');
    expect(entries.map(e => e.label)).toContain('Area Upgrade — mysteryRoom');
    const json = JSON.stringify(clientNoteEntries(row, { includeEmpty: true }));
    for (const secret of ['PRIVATE sales', 'PRIVATE admin', 'INTERNAL area note']) expect(json.includes(secret)).toBe(false);
  });
  test('includeEmpty lists every scalar and one row per area upgrade (the panel shows blanks to fill)', () => {
    const row = fixtures.find(r => r.unit_number === '24')!;
    const all = clientNoteEntries(row, { includeEmpty: true });
    expect(all.filter(e => e.kind === 'field')).toHaveLength(6);
    expect(all.filter(e => e.kind === 'area').map(e => (e as { index: number }).index)).toEqual([0, 1, 2]);
    expect(clientNoteEntries(row)).toEqual([]);
  });
  test('the PDF renderer uses clientNoteEntries and no longer builds its own list', () => {
    const pdf = src('src/lib/buyerPdfGenerator.ts');
    expect(pdf).toContain('const commentEntries = clientNoteEntries(clientNoteSourceFromSelections(selections));');
    expect(pdf.includes('commentEntries.push')).toBe(false);
  });
});

describe('applyAreaClientComment', () => {
  const withAreas = fixtures.filter(r => Array.isArray(r.area_upgrades) && (r.area_upgrades as unknown[]).length > 0);
  test('every fixture row: only clientComment of row i changes; other keys and rows byte-for-byte (same objects)', () => {
    expect(withAreas.length).toBeGreaterThanOrEqual(5);
    for (const r of withAreas) {
      const rows = r.area_upgrades as Array<Record<string, unknown>>;
      const before = JSON.stringify(rows);
      rows.forEach((target, i) => {
        const next = applyAreaClientComment(rows, i, '  Matte finish please ') as Array<Record<string, unknown>>;
        expect(JSON.stringify(rows)).toBe(before); // input not mutated
        expect(next).toHaveLength(rows.length);
        next.forEach((n, j) => { if (j !== i) expect(n).toBe(rows[j]); });
        expect(next[i].clientComment).toBe('Matte finish please');
        const { clientComment: _a, ...restNext } = next[i];
        const { clientComment: _b, ...restBefore } = target;
        expect(JSON.stringify(restNext)).toBe(JSON.stringify(restBefore));
        expect(Object.keys(next[i]).filter(k => k !== 'clientComment')).toEqual(Object.keys(target).filter(k => k !== 'clientComment'));
      });
    }
  });
  test('rejects an out-of-range or non-integer index and a non-list', () => {
    const rows = [{ areaId: 'laundry', clientComment: 'x' }];
    expect(() => applyAreaClientComment(rows, -1, 'a')).toThrow();
    expect(() => applyAreaClientComment(rows, 1, 'a')).toThrow();
    expect(() => applyAreaClientComment(rows, 0.5, 'a')).toThrow();
    expect(() => applyAreaClientComment(null, 0, 'a')).toThrow();
    expect(() => applyAreaClientComment([null], 0, 'a')).toThrow();
  });
  test('a blank note on a row without the key adds nothing', () => {
    const rows = [{ areaId: 'laundry', comments: 'internal' }];
    expect(applyAreaClientComment(rows, 0, '  ')).toEqual(rows);
  });
});

/** A PostgREST stand-in: one buyer_selections row, conditional update on updated_at, audit inserts. */
function fakeClient(row: Record<string, unknown>, opts: { bumpBeforeUpdate?: boolean; auditError?: boolean } = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let n = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u-noni', email: 'noni@bmdmaterials.com' } } }) },
    from(table: string) {
      if (table === 'submission_audit_logs') {
        return { insert: async (r: Record<string, unknown> | Array<Record<string, unknown>>) => { if (opts.auditError) return { error: { message: 'rls' } }; audits.push(...(Array.isArray(r) ? r : [r])); return { error: null }; } };
      }
      const filters: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { payload = p; return q; },
        eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        maybeSingle: async () => {
          if (!payload) return { data: filters.id === row.id ? clone(row) : null, error: null };
          if (opts.bumpBeforeUpdate) row.updated_at = 'someone-else';
          if (filters.id !== row.id || ('updated_at' in filters && filters.updated_at !== row.updated_at)) return { data: null, error: null };
          updates.push(clone(payload));
          Object.assign(row, clone(payload));
          row.updated_at = `t${++n}`;
          return { data: clone(row), error: null };
        },
      };
      return q;
    },
  };
  return { client, audits, updates };
}

const stored = () => ({
  id: 's1', updated_at: 't0', lvp_comments: 'old lvp', spc_tile_comments: null, window_comments: null,
  backsplash_grout_comments: null, upgrade_interests_notes: null, upgrade_comments: null,
  sales_comments: 'PRIVATE sales', admin_notes: 'PRIVATE admin', custom_pricing: { overrides: { grout: { amount: 1 } } },
  area_upgrades: [
    { areaId: 'masterEnsuite', materialType: 'tile', comments: 'INTERNAL', manualPrice: 8400, heatedFloor: true },
    { areaId: 'laundry', materialType: 'lvp', comments: '', clientComment: 'old note' },
  ],
});

describe('saveClientNotes', () => {
  test('a field save writes only that column, conditional on updated_at, with one client_notes_update audit row', async () => {
    const row = stored();
    const f = fakeClient(row);
    const r = await saveClientNotes(f.client as never, 's1', { fields: { spc_tile_comments: '  Grey grout lines  ' } }, 't0');
    expect(f.updates).toEqual([{ spc_tile_comments: 'Grey grout lines' }]);
    expect(r.updated_at).toBe('t1');
    expect(r.changed).toEqual(['spc_tile_comments']);
    expect(f.audits).toEqual([{
      submission_id: 's1', changed_by_user_id: 'u-noni', changed_by_email: 'noni@bmdmaterials.com',
      action_type: 'client_notes_update',
      changes: { field: 'spc_tile_comments', label: 'Bathroom Tile', from: null, to: 'Grey grout lines' },
      change_summary: 'Client note updated: Bathroom Tile',
    }]);
  });
  test('an area save re-reads the row and changes only clientComment (fresh manualPrice etc. preserved)', async () => {
    const row = stored();
    row.area_upgrades[0].manualPrice = 9100; // someone else's newer edit the caller never saw
    const f = fakeClient(row);
    await saveClientNotes(f.client as never, 's1', { areas: [{ index: 0, areaId: 'masterEnsuite', text: 'Matte tile' }] }, 't0');
    expect(Object.keys(f.updates[0])).toEqual(['area_upgrades']);
    const saved = f.updates[0].area_upgrades as Array<Record<string, unknown>>;
    expect(saved[0]).toEqual({ areaId: 'masterEnsuite', materialType: 'tile', comments: 'INTERNAL', manualPrice: 9100, heatedFloor: true, clientComment: 'Matte tile' });
    expect(JSON.stringify(saved[1])).toBe(JSON.stringify(stored().area_upgrades[1]));
    expect(f.audits[0].changes).toEqual({ field: 'area_upgrades[0].clientComment', label: 'Area Upgrade — Master Ensuite', from: null, to: 'Matte tile' });
  });
  test('conflict: a stale expectedUpdatedAt, a write that loses the race, or a moved area row → throws, nothing audited', async () => {
    for (const [opts, expected, patch] of [
      [{}, 'stale', { fields: { lvp_comments: 'x' } }],
      [{ bumpBeforeUpdate: true }, 't0', { fields: { lvp_comments: 'x' } }],
      [{}, 't0', { areas: [{ index: 1, areaId: 'masterEnsuite', text: 'x' }] }],
    ] as const) {
      const row = stored();
      const f = fakeClient(row, opts);
      let err: unknown;
      try { await saveClientNotes(f.client as never, 's1', patch as never, expected); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(ClientNotesConflictError);
      expect(isClientNotesConflict(err)).toBe(true);
      expect((err as Error).message).toBe(CLIENT_NOTES_CONFLICT_MESSAGE);
      expect(f.audits).toEqual([]);
    }
  });
  test('column allowlist: any key outside the six notes is refused before a write', async () => {
    for (const bad of ['sales_comments', 'admin_notes', 'custom_pricing', 'area_upgrades', 'unit_type', ...PRICING_FIELDS]) {
      const f = fakeClient(stored());
      await expect(saveClientNotes(f.client as never, 's1', { fields: { [bad]: 'x' } as never }, 't0')).rejects.toThrow();
      expect(f.updates).toEqual([]);
    }
  });
  test('behaviour: across every possible patch the update only ever names enumerated columns', async () => {
    const allowed = new Set<string>(CLIENT_NOTE_COLUMNS);
    for (const { key } of CLIENT_NOTE_FIELDS) {
      const f = fakeClient(stored());
      await saveClientNotes(f.client as never, 's1', { fields: { [key]: 'new text' }, areas: [{ index: 1, text: 'new area' }] }, 't0');
      for (const u of f.updates) for (const k of Object.keys(u)) expect(allowed.has(k)).toBe(true);
      expect(JSON.stringify(f.audits).includes('PRIVATE')).toBe(false);
      expect(JSON.stringify(f.audits).includes('INTERNAL')).toBe(false);
    }
  });
  test('no unchecked writes: a missing expectedUpdatedAt throws before any write', async () => {
    for (const missing of [null, undefined, '']) {
      const f = fakeClient(stored());
      await expect(saveClientNotes(f.client as never, 's1', { fields: { lvp_comments: 'x' } }, missing)).rejects.toThrow(/updated_at/);
      expect(f.updates).toEqual([]);
    }
  });
  test('a failed audit insert still saves the note and reports auditFailed', async () => {
    const f = fakeClient(stored(), { auditError: true });
    const r = await saveClientNotes(f.client as never, 's1', { fields: { lvp_comments: 'new' } }, 't0');
    expect(f.updates).toEqual([{ lvp_comments: 'new' }]);
    expect(r.auditFailed).toBe(true);
    const ok = await saveClientNotes(fakeClient(stored()).client as never, 's1', { fields: { lvp_comments: 'new' } }, 't0');
    expect(ok.auditFailed).toBe(false);
  });
  test('no change → no write and no audit row', async () => {
    const f = fakeClient(stored());
    const r = await saveClientNotes(f.client as never, 's1', { fields: { lvp_comments: ' old lvp ' }, areas: [{ index: 1, text: 'old note' }] }, 't0');
    expect(f.updates).toEqual([]);
    expect(f.audits).toEqual([]);
    expect(r.changed).toEqual([]);
  });
  test('source pin: two update calls (notes, buyer-details payload), no custom_pricing / internal-note writes', () => {
    const t = src('src/lib/clientNotes.ts');
    expect(t.match(/\.update\(/g)).toHaveLength(2);
    expect(t).toContain('.update(update)');
    expect(t).toContain('.update(payload)');
    expect([...CLIENT_NOTE_COLUMNS]).toEqual([
      'lvp_comments', 'spc_tile_comments', 'window_comments', 'backsplash_grout_comments', 'upgrade_interests_notes',
      'upgrade_comments', 'area_upgrades',
    ]);
    const code = t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(/\b(sales_comments|admin_notes|custom_pricing|internal_note)\s*:/.test(code)).toBe(false);
  });
});

// ---- Console "Edit buyer details": area clientComment goes through the writer, never through the payload ----

const editState = (row: ReturnType<typeof stored>): SubmissionEditState => ({
  id: row.id, created_at: '', updated_at: row.updated_at, unit_number: '37', unit_type: 'C', first_name: 'A',
  last_name: 'B', phone_number: null, email: 'a@b.c', estimated_possession_date: null, has_stairs: false,
  lvp_colour: null, lvp_comments: row.lvp_comments, spc_tile_colour: null, spc_tile_comments: 'tile note',
  backsplash_orientation: null, stair_carpet_colour: null, bedroom_flooring_choice: null, bedroom_carpet_colour: null,
  bedroom_lvp_colour: null, bedroom_lvp_same_as_main: false, additional_windows_qty: 0, patio_doors_qty: 0,
  upgrade_interests: {}, status: 'submitted', sales_comments: null, upgrade_comments: 'summary', upgrade_interests_notes: 'interests',
  area_upgrades: clone(row.area_upgrades) as never,
});

describe('SubmissionEditor buyerDetailsOnly', () => {
  test('the payload never carries area_upgrades; area notes are saved through saveClientNotes (clientComment only)', async () => {
    const row = stored();
    const f = fakeClient(row);
    const state = editState(row);
    state.area_upgrades![0] = { ...state.area_upgrades![0], manualPrice: 1 } as never; // stale / blocked pricing edit
    const payload = buildSubmissionUpdatePayload(state, { buyerDetailsOnly: true }) as Record<string, unknown>;
    expect('area_upgrades' in payload).toBe(false);
    expect(payload.upgrade_comments).toBe('summary');
    expect(payload.upgrade_interests_notes).toBe('interests');
    expect(payload.spc_tile_comments).toBe('tile note');
    const edits = areaClientCommentEdits(row.area_upgrades, ['Matte tile', 'old note']);
    expect(edits).toEqual([{ index: 0, areaId: 'masterEnsuite', text: 'Matte tile' }]);
    const order: string[] = [];
    const r = await saveBuyerDetailsEdit(f.client as never, 's1', payload, edits, 't0', (u) => { order.push(`details audit @${u}`); });
    expect(order).toEqual(['details audit @t1']); // step 1's audit runs before step 2
    expect(f.updates).toHaveLength(2);
    expect('area_upgrades' in f.updates[0]).toBe(false);
    expect(Object.keys(f.updates[1])).toEqual(['area_upgrades']);
    const saved = f.updates[1].area_upgrades as Array<Record<string, unknown>>;
    expect(saved[0].manualPrice).toBe(8400); // the payload's stale area row never reached the database
    expect(saved[0].clientComment).toBe('Matte tile');
    expect(r.updated_at).toBe('t2');
    expect(f.audits.map(a => a.action_type)).toEqual(['client_notes_update']);
  });
  test('no area edits → one payload write only; a payload carrying area_upgrades or custom_pricing is refused', async () => {
    const f = fakeClient(stored());
    await saveBuyerDetailsEdit(f.client as never, 's1', { first_name: 'Z' }, [], 't0');
    expect(f.updates).toEqual([{ first_name: 'Z' }]);
    await expect(saveBuyerDetailsEdit(f.client as never, 's1', { area_upgrades: [] }, [], 't1')).rejects.toThrow();
    await expect(saveBuyerDetailsEdit(f.client as never, 's1', { custom_pricing: {} }, [], 't1')).rejects.toThrow();
    await expect(saveBuyerDetailsEdit(f.client as never, 's1', { first_name: 'Y' }, [], null)).rejects.toThrow(/updated_at/);
    expect(f.updates).toHaveLength(1);
  });
  test('step 1 is conditional on updated_at: a stale dialog writes nothing and throws the panel\'s conflict', async () => {
    const f = fakeClient(stored());
    let called = false;
    let err: unknown;
    try { await saveBuyerDetailsEdit(f.client as never, 's1', { first_name: 'Z' }, [{ index: 0, areaId: 'masterEnsuite', text: 'x' }], 'stale', () => { called = true; }); } catch (e) { err = e; }
    expect(isClientNotesConflict(err)).toBe(true);
    expect((err as Error).message).toBe(CLIENT_NOTES_CONFLICT_MESSAGE);
    expect(called).toBe(false);
    expect(f.updates).toEqual([]);
  });
  test('step 2 failure: details stay saved and recorded; the error says area notes were not saved', async () => {
    const f = fakeClient(stored());
    const order: string[] = [];
    let err: unknown;
    try {
      await saveBuyerDetailsEdit(f.client as never, 's1', { first_name: 'Z' }, [{ index: 1, areaId: 'masterEnsuite', text: 'moved' }], 't0', (u) => { order.push(u); });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BuyerDetailsPartialSaveError);
    expect((err as BuyerDetailsPartialSaveError).conflict).toBe(true);
    expect((err as BuyerDetailsPartialSaveError).detailsUpdatedAt).toBe('t1');
    expect((err as Error).message).toMatch(/^Buyer details saved; area client notes not saved/);
    expect(order).toEqual(['t1']);
    expect(f.updates).toEqual([{ first_name: 'Z' }]);
  });
  test('full mode payload carries the three new note columns', () => {
    const p = buildSubmissionUpdatePayload(editState(stored())) as Record<string, unknown>;
    expect([p.spc_tile_comments, p.upgrade_interests_notes, p.upgrade_comments]).toEqual(['tile note', 'interests', 'summary']);
    const missing = { ...editState(stored()) } as Partial<SubmissionEditState>;
    delete missing.upgrade_comments; delete missing.upgrade_interests_notes;
    const q = buildSubmissionUpdatePayload(missing as SubmissionEditState) as Record<string, unknown>;
    expect('upgrade_comments' in q || 'upgrade_interests_notes' in q).toBe(false); // never blanked when not loaded
  });
  test('source pin: the editor routes buyerDetailsOnly saves through saveBuyerDetailsEdit and has every note input', () => {
    const t = src('src/components/admin/SubmissionEditor.tsx');
    expect(t).toContain('saveBuyerDetailsEdit(');
    expect(t).toContain('areaClientCommentEdits(lastSavedAreas, areaNoteDrafts), last.updated_at');
    expect(t).toContain('async (updatedAt) => { await recordSaved(updatedAt, lastSavedAreas); }');
    expect(t).toContain('error instanceof BuyerDetailsPartialSaveError');
    expect(t).toContain('onConflict?.()');
    for (const col of ['lvp_comments', 'spc_tile_comments', 'window_comments', 'backsplash_grout_comments', 'upgrade_interests_notes', 'upgrade_comments']) {
      expect(t).toContain(`handleChange('${col}'`);
    }
  });
});

describe('panel and page wiring', () => {
  test('ClientNotesPanel reads only clientNoteEntries (buyer-safe) and both pages render it with saveClientNotes', () => {
    const panel = src('src/components/quote/ClientNotesPanel.tsx');
    const code = panel.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(code).toContain('clientNoteEntries(row, { includeEmpty: true })');
    expect(/sales_comments|admin_notes|internal_note|\.comments\b/.test(code)).toBe(false);
    for (const page of ['src/pages/QuoteConsole.tsx', 'src/pages/AdminSubmissions.tsx']) {
      const t = src(page);
      expect(t).toContain('<ClientNotesPanel');
      expect(t).toContain('saveClientNotes(supabase as never');
    }
  });
});

describe('payload normalisation', () => {
  test('the six notes are trimmed (blank → null) and area clientComment trimmed, as saveClientNotes stores them', () => {
    const st = editState(stored());
    Object.assign(st, { lvp_comments: '  a  ', spc_tile_comments: '   ', window_comments: ' w', backsplash_grout_comments: 'g ', upgrade_interests_notes: ' i ', upgrade_comments: '\n' });
    st.area_upgrades![1] = { ...st.area_upgrades![1], clientComment: '  note  ' } as never;
    const p = buildSubmissionUpdatePayload(st) as Record<string, unknown>;
    expect([p.lvp_comments, p.spc_tile_comments, p.window_comments, p.backsplash_grout_comments, p.upgrade_interests_notes, p.upgrade_comments])
      .toEqual(['a', null, 'w', 'g', 'i', null]);
    expect((p.area_upgrades as Array<Record<string, unknown>>)[1].clientComment).toBe('note');
    expect('clientComment' in (p.area_upgrades as Array<Record<string, unknown>>)[0]).toBe(false);
  });
});

describe('Word copy prints the PDF notes', () => {
  test('nine fixtures (as stored and filled): Word note rows equal the PDF rows', () => {
    for (const base of fixtures) {
      for (const row of [base, withNotes(base)]) {
        const pdf = legacyPdfEntries(toBuyerPdfSelections(row as unknown as Tables<'buyer_selections'>)).map(e => [e.label, e.text]);
        expect(clientNoteRows(row)).toEqual(pdf);
      }
    }
  });
  test('source pin: downloadSubmissionWord builds its notes with clientNoteRows', () => {
    const t = src('src/lib/submissionWordExport.ts');
    expect(t).toContain('const notes = clientNoteRows(s);');
    expect(t.includes("['Flooring', s.lvp_comments]")).toBe(false);
  });
});

describe('row writers hand back updated_at', () => {
  test('status changes return the new updated_at and the Submissions page applies it', () => {
    const ctl = src('src/components/admin/StatusWorkflowControl.tsx');
    expect(ctl).toContain(".select('updated_at')");
    expect(ctl).toContain('onStatusChange(newStatus, newTimestamps, data?.updated_at ?? undefined);');
    expect(src('src/pages/AdminSubmissions.tsx')).toContain('...(updatedAt ? { updated_at: updatedAt } : {})');
    expect(src('src/pages/QuoteConsole.tsx')).toContain('onConflict={() => { setEditOpen(false); void loadRow(); }}');
  });
});

describe('History tab', () => {
  test('client_notes_update rows render as label + before/after; other rows unchanged', () => {
    expect(auditActionLabel('client_notes_update')).toBe('client note');
    expect(auditActionLabel('status_change')).toBe('status change');
    expect(auditChangeRows({ action_type: 'client_notes_update', changes: { field: 'upgrade_comments', label: 'Upgrade Pricing Summary', from: 'a', to: 'b' } }))
      .toEqual([{ key: 'upgrade_comments', label: 'Client note — Upgrade Pricing Summary', old: 'a', new: 'b' }]);
    expect(auditChangeRows({ action_type: 'update', changes: { lvp_comments: { old: 'a', new: 'b' } } }))
      .toEqual([{ key: 'lvp_comments', label: 'Lvp Comments', old: 'a', new: 'b' }]);
  });
});
