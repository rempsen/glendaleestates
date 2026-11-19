// Task 18 fix round 1: follow-ups / basement notes editor. src/lib/followUps.ts is the only custom_pricing writer;
// it must leave every other key (overrides, customItems — read by the generator) exactly as stored.
import { test, expect, describe } from 'bun:test';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { generatedTotalsForRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import {
  addFollowUp, applyNotesPatch, editFollowUpText, FOLLOWUPS_CONFLICT_MESSAGE, removeFollowUp, saveNotes,
  toggleFollowUpClient, toggleFollowUpDone,
} from '../src/lib/followUps';
import type { FollowUp } from '../src/lib/customPricing';

const rows = liveSubmissions as unknown as Array<SubmissionRow & { id: string; custom_pricing: unknown }>;
const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const others = (cp: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(cp).filter(([k]) => k !== 'followUps' && k !== 'basementNotes')));

describe('applyNotesPatch', () => {
  test('every fixture unit: only followUps / basementNotes change; other keys byte-for-byte; subtotal unchanged', () => {
    for (const row of rows) {
      const raw = (row.custom_pricing ?? {}) as Record<string, unknown>;
      const next = applyNotesPatch(raw, { followUps: [{ id: 'a', text: 'Call Mike', done: false, clientVisible: true }], basementNotes: '  Sump pump corner  ' });
      expect(others(next)).toBe(others(raw));
      expect(next.followUps).toEqual([{ id: 'a', text: 'Call Mike', done: false, clientVisible: true }]);
      expect(next.basementNotes).toBe('Sump pump corner');
      const before = generatedTotalsForRow(row, pricing).totals.subtotal;
      const after = generatedTotalsForRow({ ...row, custom_pricing: next } as never, pricing).totals.subtotal;
      expect(after).toBe(before);
    }
  });
  test('an unpatched key is left alone; a blank basement note is removed; garbage input becomes an object', () => {
    const raw = { overrides: { grout: { amount: 0 } }, followUps: [{ id: 'x', text: 'keep' }], basementNotes: 'old' };
    expect(applyNotesPatch(raw, { basementNotes: ' ' })).toEqual({ overrides: { grout: { amount: 0 } }, followUps: [{ id: 'x', text: 'keep' }] });
    expect(applyNotesPatch(raw, { followUps: [] })).toEqual({ overrides: { grout: { amount: 0 } }, followUps: [], basementNotes: 'old' });
    expect(applyNotesPatch('garbage', { followUps: [] })).toEqual({ followUps: [] });
    expect(raw.basementNotes).toBe('old'); // input not mutated
  });
});

describe('the five follow-up actions', () => {
  const base: FollowUp[] = [{ id: 'a', text: 'Confirm Catalyst', done: false, clientVisible: false }];
  test('add (trimmed; empty ignored), edit text (empty ignored), toggle done, toggle show client, delete', () => {
    const added = addFollowUp(base, '  Send PDF  ', 'b');
    expect(added).toEqual([...base, { id: 'b', text: 'Send PDF', done: false, clientVisible: false }]);
    expect(addFollowUp(base, '   ')).toBe(base);
    expect(editFollowUpText(added, 'b', 'Send signed PDF')[1].text).toBe('Send signed PDF');
    expect(editFollowUpText(added, 'b', ' ')).toBe(added);
    expect(toggleFollowUpDone(added, 'a')[0].done).toBe(true);
    expect(toggleFollowUpClient(added, 'a')[0].clientVisible).toBe(true);
    expect(removeFollowUp(added, 'a').map((f) => f.id)).toEqual(['b']);
  });
});

/** A tiny PostgREST stand-in: one buyer_selections row, conditional update on updated_at, audit inserts. */
function fakeClient(row: { id: string; custom_pricing: unknown; updated_at: string }, opts: { bumpBeforeUpdate?: boolean } = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let n = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u-noni', email: 'noni@bmdmaterials.com' } } }) },
    from(table: string) {
      if (table === 'submission_audit_logs') return { insert: async (r: Record<string, unknown>) => { audits.push(r); return { error: null }; } };
      const filters: Record<string, unknown> = {};
      let payload: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { payload = p; return q; },
        eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        maybeSingle: async () => {
          if (!payload) return { data: { custom_pricing: row.custom_pricing, updated_at: row.updated_at }, error: null };
          if (opts.bumpBeforeUpdate) row.updated_at = 'someone-else';
          if (filters.id !== row.id || filters.updated_at !== row.updated_at) return { data: null, error: null };
          updates.push(payload);
          row.custom_pricing = JSON.parse(JSON.stringify(payload.custom_pricing));
          row.updated_at = `t${++n}`;
          return { data: { custom_pricing: row.custom_pricing, updated_at: row.updated_at }, error: null };
        },
      };
      return q;
    },
  };
  return { client, audits, updates, row };
}

describe('saveNotes', () => {
  const stored = () => ({ id: 's24', updated_at: 't0', custom_pricing: { overrides: { stairCarpet: { amount: 1005 } }, customItems: [{ id: 'c1', label: 'Roller shade — Living Room', amount: 673.5 }], followUps: [] } });

  test('writes only follow-ups, keeps overrides / customItems byte-for-byte, audits followups_update', async () => {
    const f = fakeClient(stored());
    const before = JSON.stringify({ overrides: f.row.custom_pricing.overrides, customItems: f.row.custom_pricing.customItems });
    const r = await saveNotes(f.client as never, 's24', 't0', { followUps: [{ id: 'a', text: 'Call Mike', done: false }] });
    expect(r).toMatchObject({ ok: true, updated_at: 't1' });
    const cp = f.row.custom_pricing as Record<string, unknown>;
    expect(JSON.stringify({ overrides: cp.overrides, customItems: cp.customItems })).toBe(before);
    expect(Object.keys(f.updates[0])).toEqual(['custom_pricing']);
    expect(f.audits).toHaveLength(1);
    expect(f.audits[0]).toMatchObject({ submission_id: 's24', changed_by_user_id: 'u-noni', action_type: 'followups_update' });
    expect(Object.keys(f.audits[0].changes as object)).toEqual(['custom_pricing.followUps']);
  });

  test('stale updated_at → conflict, nothing written, no audit', async () => {
    const f = fakeClient(stored());
    expect(await saveNotes(f.client as never, 's24', 'older', { basementNotes: 'x' })).toEqual({ ok: false, conflict: true });
    expect(f.updates).toHaveLength(0);
    expect(f.audits).toHaveLength(0);
    expect(FOLLOWUPS_CONFLICT_MESSAGE).toMatch(/^Reloaded — someone else edited/);
  });

  test('a concurrent edit between read and write → conflict (conditional update matched no row)', async () => {
    const f = fakeClient(stored(), { bumpBeforeUpdate: true });
    expect(await saveNotes(f.client as never, 's24', 't0', { basementNotes: 'x' })).toEqual({ ok: false, conflict: true });
    expect(f.audits).toHaveLength(0);
  });

  test('basement notes are saved through the same writer', async () => {
    const f = fakeClient(stored());
    await saveNotes(f.client as never, 's24', 't0', { basementNotes: 'Rough-in for bar sink' });
    expect((f.row.custom_pricing as Record<string, unknown>).basementNotes).toBe('Rough-in for bar sink');
    expect(Object.keys(f.audits[0].changes as object)).toEqual(['custom_pricing.basementNotes']);
  });
});
