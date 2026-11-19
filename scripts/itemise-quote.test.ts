// Final fix wave C1: the console's "Itemise this quote" banner and its inserts. An un-itemised submission locks the
// console's edits until the generated lines are stored; after itemising, the stored total equals the generated total.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { buildGenerateInputFromRow, pricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { generateQuoteLines, sumQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';
import { savedSubmissionLines } from '../src/lib/generateInputFromSelections';
import {
  consoleItemiseState, fetchItemiseInputs, itemiseLineInputs, itemiseSubmission, ITEMISE_BANNER_TITLE, ITEMISE_LOCKED_REASON,
  ALREADY_ITEMISED_TEXT,
} from '../src/lib/itemiseQuote';
import { ItemiseBanner } from '../src/components/quote/ItemiseBanner';
import { PINNED_SUBTOTALS } from './lib/parityPins';

const pricing = pricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
const rows = liveSubmissions as unknown as SubmissionRow[];
const GST = pricing.gstRate;

describe('banner state', () => {
  test('loaded with no stored lines → banner and locked', () => {
    expect(consoleItemiseState({ loading: false, loadError: null, lines: [] })).toEqual({ needsItemising: true, locked: true });
  });
  test('only office / buyer_request lines → still not itemised (banner, locked)', () => {
    for (const source of ['office', 'buyer_request'] as const) {
      expect(consoleItemiseState({ loading: false, loadError: null, lines: [{ source }] })).toEqual({ needsItemising: true, locked: true });
    }
  });
  test('any wizard / migration line (even removed) → itemised, unlocked', () => {
    expect(consoleItemiseState({ loading: false, loadError: null, lines: [{ source: 'migration' }, { source: 'office' }] }))
      .toEqual({ needsItemising: false, locked: false });
    expect(consoleItemiseState({ loading: false, loadError: null, lines: [{ source: 'wizard' }] })).toEqual({ needsItemising: false, locked: false });
  });
  test('loading or load error → no banner (not yet known) but locked', () => {
    expect(consoleItemiseState({ loading: true, loadError: null, lines: [] })).toEqual({ needsItemising: false, locked: true });
    expect(consoleItemiseState({ loading: false, loadError: 'boom', lines: [] })).toEqual({ needsItemising: false, locked: true });
  });
  test('banner renders its title and the Itemise button', () => {
    const html = renderToStaticMarkup(createElement(ItemiseBanner, { busy: false, onItemise: () => {} }));
    expect(html).toContain(ITEMISE_BANNER_TITLE);
    expect(html).toContain('Itemise this quote');
    expect(renderToStaticMarkup(createElement(ItemiseBanner, { busy: true, onItemise: () => {} }))).toContain('Itemising…');
  });
});

describe('itemising inserts the generated quote (source migration); totals unchanged on all nine units', () => {
  for (const row of rows) {
    test(`Unit ${row.unit_number}`, () => {
      const generated = generateQuoteLines(buildGenerateInputFromRow(row, pricing));
      const inputs = itemiseLineInputs(row, pricing);
      expect(inputs.length).toBe(generated.length);
      expect(inputs.map((i) => i.sort_order)).toEqual(inputs.map((_, k) => k + 1)); // deterministic 1..N (sentinel = 1)
      for (const i of inputs) {
        expect(i.source).toBe('migration');
        expect('id' in i).toBe(false);
        expect('submission_id' in i).toBe(false);
      }
      // What the console then stores (createLine adds id / submission_id).
      const stored = inputs.map((i, k) => ({ ...i, id: `n${k}`, submission_id: row.id }) as QuoteLine);
      const money = (l: QuoteLine[]) => {
        const t = sumQuoteLines(l, GST);
        return [t.upgrades, t.windowCoverings, t.subtotal, t.gst, t.total, t.notInTotal.length].map(String);
      };
      expect(money(stored)).toEqual(money(generated));
      expect(sumQuoteLines(stored, GST).subtotal.toFixed(2)).toBe(PINNED_SUBTOTALS[String(row.unit_number)].toFixed(2));
      // Stored lines now win on every surface (db) and the console unlocks.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = savedSubmissionLines(stored as any, row, pricing);
      expect(r.linesSource).toBe('db');
      expect(sumQuoteLines(r.lines, GST).total.toFixed(2)).toBe(sumQuoteLines(generated, GST).total.toFixed(2));
      expect(consoleItemiseState({ loading: false, loadError: null, lines: stored }).locked).toBe(false);
    });
  }
});

test('fetchItemiseInputs reads the fresh row and active pricing, and surfaces a read error', async () => {
  const row = rows[0];
  const snap = pricingSnapshot as unknown as PricingSnapshot;
  const tables: Record<string, unknown> = {
    buyer_selections: row, pricing_config: snap.pricing_config, upgrade_materials: snap.upgrade_materials, unit_area_data: snap.unit_area_data,
  };
  const eqs: string[] = [];
  const client = (fail?: string) => ({
    from: (t: string) => {
      const res = () => Promise.resolve(fail === t ? { data: null, error: new Error(`${t} denied`) } : { data: tables[t], error: null });
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, eq: (c: string, v: unknown) => { eqs.push(`${t}.${c}=${String(v)}`); return q; }, single: res,
        then: (a: (v: unknown) => unknown, b: (e: unknown) => unknown) => res().then(a, b),
      });
      return q;
    },
  });
  const inputs = await fetchItemiseInputs(client(), row.id);
  expect(inputs.length).toBe(generateQuoteLines(buildGenerateInputFromRow(row, pricingFromRows(snap))).length);
  expect(eqs).toContain(`buyer_selections.id=${row.id}`);
  expect(eqs).toContain('pricing_config.is_active=true');
  await expect(fetchItemiseInputs(client('pricing_config'), row.id)).rejects.toThrow('pricing_config denied');
});

test('console wiring: banner on needsItemising; Add line, status edits and Documents locked', () => {
  const src = readFileSync(join(import.meta.dir, '../src/pages/QuoteConsole.tsx'), 'utf8');
  expect(src).toContain('consoleItemiseState({ loading: q.loading, loadError: q.loadError, lines: q.lines })');
  expect(src).toContain('{itemise.needsItemising && <ItemiseBanner');
  expect(src).toContain('const addDisabled = itemise.locked;');
  expect(src).toContain("if (itemise.locked) { toast.error(ITEMISE_LOCKED_REASON); return; }");
  expect(src).toContain('lockedReason={itemise.locked ? ITEMISE_LOCKED_REASON : null}');
  expect(src).toContain('const r = await itemiseSubmission(supabase, id);');
  expect(src).toContain("if (r.status === 'already') toast.info(ALREADY_ITEMISED_TEXT);");
  expect(src).toContain('await q.refresh();');
  expect(ALREADY_ITEMISED_TEXT).toBe('Already itemised — reloading');
  expect(ITEMISE_LOCKED_REASON).toBe('Itemise this quote first');
});

describe('itemise race: client re-check and the 23505 sentinel collision', () => {
  const row = rows[0];
  const snap = pricingSnapshot as unknown as PricingSnapshot;
  function fakeDb(opts: { existing?: number; insertError?: { code: string; message: string } } = {}) {
    const inserts: Array<Array<Record<string, unknown>>> = [];
    const tables: Record<string, unknown> = {
      buyer_selections: row, pricing_config: snap.pricing_config, upgrade_materials: snap.upgrade_materials, unit_area_data: snap.unit_area_data,
      quote_lines: Array.from({ length: opts.existing ?? 0 }, (_, i) => ({ id: `e${i}` })),
    };
    const client = {
      from: (t: string) => {
        const res = () => Promise.resolve({ data: tables[t], error: null });
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          select: () => q, eq: () => q, in: () => q, limit: () => q, single: res,
          insert: (r: Array<Record<string, unknown>>) => { inserts.push(r); return Promise.resolve({ data: null, error: opts.insertError ?? null }); },
          then: (a: (v: unknown) => unknown, b: (e: unknown) => unknown) => res().then(a, b),
        });
        return q;
      },
    };
    return { client, inserts };
  }

  test('no stored set: ONE insert of the whole set, sort_order 1..N, source migration, no forbidden keys', async () => {
    const db = fakeDb();
    const r = await itemiseSubmission(db.client, row.id);
    expect(r.status).toBe('itemised');
    expect(db.inserts).toHaveLength(1);
    const batch = db.inserts[0];
    expect(batch.map((l) => l.sort_order)).toEqual(batch.map((_, k) => k + 1));
    for (const l of batch) {
      expect(l.source).toBe('migration');
      expect(l.submission_id).toBe(row.id);
      for (const k of ['id', 'updated_at', 'counts_in_total', 'updated_by']) expect(k in l).toBe(false);
    }
    if (r.status === 'itemised') expect(r.count).toBe(batch.length);
  });

  test('another tab already itemised (a wizard / migration line exists): nothing inserted, "already"', async () => {
    const db = fakeDb({ existing: 1 });
    expect(await itemiseSubmission(db.client, row.id)).toEqual({ status: 'already' });
    expect(db.inserts).toHaveLength(0);
  });

  test('concurrent second set hits quote_lines_one_migration_set (23505): "already", not an error', async () => {
    const db = fakeDb({ insertError: { code: '23505', message: 'duplicate key value violates unique constraint "quote_lines_one_migration_set"' } });
    expect(await itemiseSubmission(db.client, row.id)).toEqual({ status: 'already' });
  });

  test('any other insert error is thrown (toast in the console)', async () => {
    const db = fakeDb({ insertError: { code: '23514', message: 'quote_lines_counted_visible' } });
    await expect(itemiseSubmission(db.client, row.id)).rejects.toMatchObject({ code: '23514' });
  });
});
