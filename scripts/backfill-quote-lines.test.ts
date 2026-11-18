// Phase 2 Task 5: quote_lines backfill. Dry run = parity report only; --write (CONFIRM_BACKFILL=yes + --expect
// <signed-off dry run>) inserts source='migration' lines for ok rows with no existing lines, once (Review Focus 5),
// never partially, and stops at once if a rollback fails.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import expectedShape from './fixtures/quote-lines-expected.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { enginePricingFromRows, engineTotalsForRow, type SubmissionRow } from './lib/generateInputFromRow';
import {
  runBackfill, parseArgs, formatTable, main, exitCodeFor, BackfillRefused, expectedShapeFromReport,
  type BackfillDb, type BackfillReport, type InsertLine,
} from './backfill-quote-lines';

// Copied verbatim from scripts/parity.test.ts (EXPECTED_SUBTOTALS); these pins never change.
const EXPECTED_SUBTOTALS: Record<string, number> = {
  '2': 2460, '4': 14334, '7': 3296.7, '24': 10388.4, '27': 0, '31': 27263, '37': 10488.5, '38': 2680.5, '43': 23865,
};

const rows = liveSubmissions as unknown as SubmissionRow[];

interface Stub extends BackfillDb {
  store: Map<string, InsertLine[]>;
  calls: { insert: number; delete: number; list: number };
  failInsertFor?: string;
  failRollback?: boolean;
  failCountFor?: string;
  failList?: boolean;
  /** Mutates the pricing rows before they are returned (simulates a live price change). */
  pricingPatch?: (rows: PricingSnapshot) => void;
}

function stubDb(existing: Record<string, number> = {}): Stub {
  const store = new Map<string, InsertLine[]>();
  for (const [id, n] of Object.entries(existing)) {
    store.set(id, Array.from({ length: n }, () => ({ submission_id: id, source: 'office' }) as unknown as InsertLine));
  }
  const calls = { insert: 0, delete: 0, list: 0 };
  const db: Stub = {
    store, calls,
    async listSubmissions() {
      calls.list++;
      if (db.failList) throw new Error('simulated connection reset');
      return structuredClone(rows);
    },
    async countLines(id) {
      if (db.failCountFor === id) throw new Error('simulated count timeout');
      return store.get(id)?.length ?? 0;
    },
    async insertLines(lines) {
      calls.insert++;
      const id = lines[0].submission_id;
      // Simulate a failure after some rows landed (worst case for "never partial").
      if (db.failInsertFor === id) { store.set(id, lines.slice(0, 3)); throw new Error('simulated insert error'); }
      store.set(id, [...(store.get(id) ?? []), ...structuredClone(lines)]);
    },
    async deleteMigrationLines(id) {
      calls.delete++;
      if (db.failRollback) throw new Error('simulated delete error');
      store.set(id, (store.get(id) ?? []).filter((l) => l.source !== 'migration'));
    },
    async loadPricingRows() {
      const p = structuredClone(pricingSnapshot) as unknown as PricingSnapshot;
      db.pricingPatch?.(p);
      return p;
    },
  };
  return db;
}

/** The signed-off dry run, as the operator saves it with --json. */
async function signedOff(db: BackfillDb = stubDb(), unit?: string): Promise<BackfillReport> {
  return JSON.parse(JSON.stringify(await runBackfill(db, { write: false, unit })));
}
const W = async (extra: Record<string, unknown> = {}) => ({ write: true, confirm: 'yes', expect: await signedOff(), ...extra });

const idOf = (unit: string) => rows.find((r) => r.unit_number === unit)!.id;

describe('dry run', () => {
  test('9 rows, all ok, subtotals equal the parity.test.ts pins, zero side effects', async () => {
    const db = stubDb();
    const report = await runBackfill(db, { write: false });
    expect(report.mode).toBe('dry-run');
    expect(report.rows).toHaveLength(9);
    for (const r of report.rows) {
      expect(r.status).toBe('ok');
      expect(r.reasons).toEqual([]);
      expect(r.engine_subtotal.toFixed(2)).toBe(EXPECTED_SUBTOTALS[r.unit].toFixed(2));
      expect(r.lines_subtotal.toFixed(2)).toBe(EXPECTED_SUBTOTALS[r.unit].toFixed(2));
      expect(r.windows_lines.toFixed(2)).toBe(r.windows_engine.toFixed(2));
      expect(r.written).toBe(0);
    }
    expect(report.writes).toBe(0);
    expect(report.aborted).toBe(false);
    expect(report.error).toBeNull();
    expect(db.calls.insert).toBe(0);
    expect(db.calls.delete).toBe(0);
    expect(exitCodeFor(report)).toBe(0);
  });

  test('--unit restricts to one unit', async () => {
    const report = await runBackfill(stubDb(), { write: false, unit: '24' });
    expect(report.rows.map((r) => r.unit)).toEqual(['24']);
  });

  test('table has the exact header and one row per submission', async () => {
    const report = await runBackfill(stubDb(), { write: false });
    const lines = formatTable(report).split('\n');
    expect(lines[0].split('|').map((s) => s.trim())).toEqual([
      'unit', 'submission_id', 'engine_subtotal', 'lines_subtotal', 'windows_engine', 'windows_lines',
      'counted_lines', 'not_in_total', 'status',
    ]);
    const unit24 = lines.find((l) => l.includes(idOf('24')))!.split('|').map((s) => s.trim());
    expect(unit24[0]).toBe('24');
    expect(unit24[2]).toBe('10388.40');
    expect(unit24[8]).toBe('ok');
  });

  test('pinned expected shape (scripts/fixtures/quote-lines-expected.json) regenerates identically', async () => {
    const report = await runBackfill(stubDb(), { write: false });
    expect(expectedShapeFromReport(report)).toEqual(expectedShape);
  });
});

describe('frozen shape cross-check (not self-referential)', () => {
  test('counted_lines = engine lineItems with amount > 0, windows itemised one line per opening', () => {
    const pricing = enginePricingFromRows(pricingSnapshot as unknown as PricingSnapshot);
    const shape = expectedShape as Record<string, { counted_lines: number }>;
    for (const row of rows) {
      const { client, server } = engineTotalsForRow(row, pricing);
      const openings = (row.additional_windows_qty || 0) + (row.patio_doors_qty || 0) + (row.automated_windows_qty || 0);
      for (const eng of [client, server]) {
        const priced = eng.lineItems.filter((li) => li.amount > 0);
        const priceWindows = priced.filter((li) => li.group === 'window');
        expect(shape[row.unit_number].counted_lines).toBe(priced.length - priceWindows.length + openings);
        // Where every window column has quantity 1, it is exactly the engine's priced item count.
        if (openings === priceWindows.length) expect(shape[row.unit_number].counted_lines).toBe(priced.length);
      }
    }
  });
});

describe('--write', () => {
  test('twice: inserts once per submission, second run reports 0 writes (idempotent)', async () => {
    const db = stubDb();
    const first = await runBackfill(db, await W());
    expect(first.mode).toBe('write');
    expect(first.rows.every((r) => r.status === 'ok')).toBe(true);
    expect(first.writes).toBe(9);
    expect(db.calls.insert).toBe(9); // one batch per submission
    for (const r of first.rows) {
      const stored = db.store.get(r.submission_id)!;
      expect(stored.length).toBe(r.line_count);
      expect(r.written).toBe(r.line_count);
      for (const l of stored) {
        expect(l.source).toBe('migration');
        expect(l.created_by).toBeNull();
        expect(l.submission_id).toBe(r.submission_id);
        expect('counts_in_total' in l).toBe(false);
        expect('id' in l).toBe(false);
      }
    }
    const before = JSON.stringify([...db.store]);
    const second = await runBackfill(db, await W());
    expect(second.writes).toBe(0);
    expect(second.rows.every((r) => r.status === 'skipped: has lines')).toBe(true);
    expect(db.calls.insert).toBe(9);
    expect(JSON.stringify([...db.store])).toBe(before);
    expect(exitCodeFor(second)).toBe(0);
  });

  test('a deliberately altered amount → FAIL and excluded from writes', async () => {
    const db = stubDb();
    const target = idOf('31');
    const report = await runBackfill(db, await W(), {
      transformLines: (lines, row) => row.id !== target ? lines : lines.map((l, i) =>
        i === lines.findIndex((x) => x.status === 'upgrade' && (x.amount ?? 0) > 0) ? { ...l, amount: (l.amount as number) + 1 } : l),
    });
    const r31 = report.rows.find((r) => r.unit === '31')!;
    expect(r31.status).toBe('FAIL');
    expect(r31.errored).toBe(false);
    expect(r31.reasons.length).toBeGreaterThan(0);
    expect(r31.lines_subtotal - r31.engine_subtotal).toBeCloseTo(1, 6);
    expect(r31.written).toBe(0);
    expect(db.store.get(target)).toBeUndefined();
    expect(report.writes).toBe(8);
    expect(formatTable(report)).toContain('FAIL Unit 31');
    expect(exitCodeFor(report)).toBe(1);
  });

  test('a submission that already has lines → skipped: has lines, untouched', async () => {
    const target = idOf('7');
    const db = stubDb({ [target]: 2 });
    const report = await runBackfill(db, { write: true, confirm: 'yes', expect: await signedOff(stubDb({ [target]: 2 })) });
    const r7 = report.rows.find((r) => r.unit === '7')!;
    expect(r7.status).toBe('skipped: has lines');
    expect(r7.written).toBe(0);
    expect(db.store.get(target)!.length).toBe(2);
    expect(report.writes).toBe(8);
    // Also reported in a dry run.
    expect((await runBackfill(stubDb({ [target]: 1 }), { write: false })).rows.find((r) => r.unit === '7')!.status)
      .toBe('skipped: has lines');
  });

  test('insert error → rolled back (no partial set) and FAIL; the run continues', async () => {
    const db = stubDb();
    db.failInsertFor = idOf('43');
    const report = await runBackfill(db, await W());
    const r43 = report.rows.find((r) => r.unit === '43')!;
    expect(r43.status).toBe('FAIL');
    expect(r43.reasons.join(' ')).toContain('simulated insert error');
    expect(r43.reasons).toContain('rolled back');
    expect(r43.written).toBe(0);
    expect(db.store.get(idOf('43'))).toEqual([]);
    expect(db.calls.delete).toBe(1);
    expect(report.writes).toBe(8);
    expect(report.aborted).toBe(false);
  });

  test('without CONFIRM_BACKFILL=yes refuses before touching the database', async () => {
    const expectFile = await signedOff();
    for (const confirm of [undefined, '', 'no', 'YES ']) {
      const db = stubDb();
      await expect(runBackfill(db, { write: true, confirm, expect: expectFile })).rejects.toBeInstanceOf(BackfillRefused);
      expect(db.calls).toEqual({ insert: 0, delete: 0, list: 0 });
    }
  });

  test('without --expect (signed-off report) refuses before touching the database', async () => {
    const db = stubDb();
    await expect(runBackfill(db, { write: true, confirm: 'yes' })).rejects.toBeInstanceOf(BackfillRefused);
    expect(db.calls).toEqual({ insert: 0, delete: 0, list: 0 });
  });
});

describe('--write against the signed-off report (--expect)', () => {
  test('a price that changed after sign-off → those rows FAIL "differs from signed-off report", not written', async () => {
    const expectFile = await signedOff();
    const db = stubDb();
    db.pricingPatch = (p) => {
      const row = p.pricing_config.find((c) => c.config_key === 'patio_door_price')!;
      row.config_value = Number(row.config_value) + 100;
    };
    const report = await runBackfill(db, { write: true, confirm: 'yes', expect: expectFile });
    const withPatio = rows.filter((r) => (r.patio_doors_qty || 0) > 0).map((r) => r.unit_number);
    expect(withPatio.length).toBeGreaterThan(0);
    for (const r of report.rows) {
      if (withPatio.includes(r.unit)) {
        // Parity with the (changed) engines still holds; only the sign-off check catches it.
        expect(r.reasons.every((x) => x.startsWith('differs from signed-off report'))).toBe(true);
        expect(r.status).toBe('FAIL');
        expect(r.written).toBe(0);
        expect(db.store.get(r.submission_id)).toBeUndefined();
      } else {
        expect(r.status).toBe('ok');
        expect(r.written).toBe(r.line_count);
      }
    }
    expect(report.writes).toBe(9 - withPatio.length);
    expect(exitCodeFor(report)).toBe(1);
  });

  test('a row that was not ok in the signed-off report is never written', async () => {
    const expectFile = await signedOff();
    expectFile.rows.find((r) => r.unit === '38')!.status = 'FAIL';
    const db = stubDb();
    const report = await runBackfill(db, { write: true, confirm: 'yes', expect: expectFile });
    const r38 = report.rows.find((r) => r.unit === '38')!;
    expect(r38.status).toBe('FAIL');
    expect(r38.reasons.join(' ')).toContain('not ok in signed-off report');
    expect(db.store.get(idOf('38'))).toBeUndefined();
  });

  test('a signed-off report with a different set of submissions (or not a dry run) refuses the whole run', async () => {
    const fewer = await signedOff();
    fewer.rows = fewer.rows.filter((r) => r.unit !== '43');
    const more = await signedOff();
    more.rows.push({ ...more.rows[0], unit: '99', submission_id: '00000000-0000-0000-0000-000000000000' });
    const dup = await signedOff();
    dup.rows.push({ ...dup.rows[0] });
    const notDry = { ...(await signedOff()), mode: 'write' };
    for (const bad of [fewer, more, dup, notDry, { rows: [] }, null, 'nope']) {
      const db = stubDb();
      await expect(runBackfill(db, { write: true, confirm: 'yes', expect: bad })).rejects.toBeInstanceOf(BackfillRefused);
      expect(db.calls.insert).toBe(0);
    }
  });

  test('--unit restricts the signed-off set to that unit (full sign-off, one-unit write)', async () => {
    const db = stubDb();
    const report = await runBackfill(db, await W({ unit: '24' }));
    expect(report.rows.map((r) => [r.unit, r.status])).toEqual([['24', 'ok']]);
    expect(report.writes).toBe(1);
  });
});

describe('operator safety on errors', () => {
  test('a DB error on one row marks it FAIL and the run continues; every row is reported and streamed', async () => {
    const db = stubDb();
    db.failCountFor = idOf('24');
    const seen: string[] = [];
    const report = await runBackfill(db, { ...(await W()), onRow: (r) => seen.push(`${r.unit}:${r.status}`) });
    const r24 = report.rows.find((r) => r.unit === '24')!;
    expect(r24.status).toBe('FAIL');
    expect(r24.errored).toBe(true);
    expect(r24.reasons.join(' ')).toContain('simulated count timeout');
    expect(r24.written).toBe(0);
    expect(report.rows).toHaveLength(9);
    expect(report.writes).toBe(8);
    expect(seen).toHaveLength(9);
    expect(seen).toContain('24:FAIL');
    expect(exitCodeFor(report)).toBe(2);
  });

  test('a run-level read error returns a report with error set (no throw)', async () => {
    const db = stubDb();
    db.failList = true;
    const report = await runBackfill(db, { write: false });
    expect(report.error).toContain('simulated connection reset');
    expect(report.rows).toEqual([]);
    expect(exitCodeFor(report)).toBe(2);
  });

  test('ROLLBACK FAILED stops the run: no further inserts, remaining rows "skipped: aborted", exit 3', async () => {
    const db = stubDb();
    db.failInsertFor = idOf('24');
    db.failRollback = true;
    const report = await runBackfill(db, await W());
    expect(report.rows.map((r) => r.unit)).toEqual(['2', '4', '7', '24', '27', '31', '37', '38', '43']);
    expect(report.aborted).toBe(true);
    const r24 = report.rows.find((r) => r.unit === '24')!;
    expect(r24.status).toBe('FAIL');
    expect(r24.reasons.join(' ')).toContain('ROLLBACK FAILED');
    expect(report.rows.slice(4).every((r) => r.status === 'skipped: aborted')).toBe(true);
    expect(db.calls.insert).toBe(4); // units 2, 4, 7 and the failed 24; nothing after
    expect(report.writes).toBe(3);
    expect(exitCodeFor(report)).toBe(3);
    expect(formatTable(report)).toContain('ABORTED');
  });
});

describe('CLI', () => {
  test('parseArgs', () => {
    expect(parseArgs([])).toEqual({ write: false, json: false, unit: undefined });
    expect(parseArgs(['--write', '--unit', '24', '--json'])).toEqual({ write: true, json: true, unit: '24' });
    expect(parseArgs(['--unit=7'])).toEqual({ write: false, json: false, unit: '7' });
    expect(parseArgs(['--write', '--expect', 'd.json'])).toEqual({ write: true, json: false, unit: undefined, expect: 'd.json' });
    expect(parseArgs(['--expect=d.json'])).toEqual({ write: false, json: false, unit: undefined, expect: 'd.json' });
    expect(() => parseArgs(['--unit'])).toThrow();
    expect(() => parseArgs(['--unit='])).toThrow();
    expect(() => parseArgs(['--expect'])).toThrow();
    expect(() => parseArgs(['--expect', '--write'])).toThrow();
    expect(() => parseArgs(['--wirte'])).toThrow();
  });

  const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, log: (s: string) => out.push(s), error: (s: string) => err.push(s) }; };
  const ENV = { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' };
  const WENV = { ...ENV, CONFIRM_BACKFILL: 'yes' };
  const files = (m: Record<string, unknown>) => (p: string) => {
    if (!(p in m)) throw new Error(`ENOENT: ${p}`);
    return typeof m[p] === 'string' ? (m[p] as string) : JSON.stringify(m[p]);
  };

  test('--write without CONFIRM_BACKFILL=yes exits 2 and never builds a db', async () => {
    const o = io();
    let built = 0;
    const code = await main(['--write', '--expect', 'd.json'], ENV, o, () => { built++; return stubDb(); }, files({ 'd.json': await signedOff() }));
    expect(code).toBe(2);
    expect(built).toBe(0);
    expect(o.err.join('\n')).toContain('CONFIRM_BACKFILL=yes');
  });

  test('--write without --expect exits 2 and never builds a db', async () => {
    const o = io();
    let built = 0;
    expect(await main(['--write'], WENV, o, () => { built++; return stubDb(); })).toBe(2);
    expect(built).toBe(0);
    expect(o.err.join('\n')).toContain('--expect');
  });

  test('--expect file missing or not JSON exits 2 and never builds a db', async () => {
    for (const f of [files({}), files({ 'd.json': '{not json' })]) {
      const o = io();
      let built = 0;
      expect(await main(['--write', '--expect', 'd.json'], WENV, o, () => { built++; return stubDb(); }, f)).toBe(2);
      expect(built).toBe(0);
    }
  });

  test('missing env exits 2', async () => {
    const o = io();
    expect(await main([], {}, o, () => stubDb())).toBe(2);
    expect(o.err.join('\n')).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  test('--json prints the report as JSON; dry run exit 0', async () => {
    const o = io();
    const code = await main(['--json', '--unit', '24'], ENV, o, () => stubDb());
    expect(code).toBe(0);
    const parsed = JSON.parse(o.out.join('\n'));
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].status).toBe('ok');
  });

  test('the dry-run --json stdout round-trips as --expect for a successful write (exit 0)', async () => {
    const dry = io();
    expect(await main(['--json'], ENV, dry, () => stubDb())).toBe(0);
    const db = stubDb();
    const o = io();
    expect(await main(['--write', '--expect', 'd.json'], WENV, o, () => db, files({ 'd.json': dry.out.join('\n') }))).toBe(0);
    expect([...db.store.values()].filter((l) => l.length > 0)).toHaveLength(9);
  });

  test('a parity FAIL (differs from signed-off) exits 1', async () => {
    const tampered = await signedOff();
    tampered.rows.find((r) => r.unit === '2')!.lines_subtotal = 1;
    const o = io();
    expect(await main(['--write', '--expect', 'd.json'], WENV, o, () => stubDb(), files({ 'd.json': tampered }))).toBe(1);
  });

  test('an insert error (rolled back) exits 2; every row is streamed to stderr and the full report printed', async () => {
    const o = io();
    const db = stubDb();
    db.failInsertFor = idOf('2');
    const code = await main(['--write', '--expect', 'd.json'], WENV, o, () => db, files({ 'd.json': await signedOff() }));
    expect(code).toBe(2);
    expect(o.err.filter((l) => l.startsWith('[backfill] Unit '))).toHaveLength(9);
    expect(o.out.join('\n')).toContain('FAIL Unit 2');
    expect(o.out.join('\n')).toContain('writes 8');
  });

  test('a run-level error still prints the (empty) report and exits 2', async () => {
    const o = io();
    const db = stubDb();
    db.failList = true;
    expect(await main([], ENV, o, () => db)).toBe(2);
    expect(o.out.join('\n')).toContain('ERROR: could not read pricing / submissions');
  });

  test('rollback failure exits 3', async () => {
    const o = io();
    const db = stubDb();
    db.failInsertFor = idOf('43');
    db.failRollback = true;
    expect(await main(['--write', '--expect', 'd.json'], WENV, o, () => db, files({ 'd.json': await signedOff() }))).toBe(3);
    expect(o.err.join('\n')).toContain('manual cleanup');
  });
});

test('backfill builds inputs only through the shared builder (no inline mapping, no prices)', () => {
  const src = readFileSync(join(import.meta.dir, 'backfill-quote-lines.ts'), 'utf8');
  expect(src).toContain("from './lib/generateInputFromRow'");
  expect(src).not.toMatch(/toBuyerPdfSelections|computeUpgradeTotals\(|serverPricingFromRows/);
  expect(src).not.toMatch(/\b\d{2,}\.\d{2}\b/); // no hardcoded dollar amounts
  expect(src).not.toMatch(/buyer_selection_drafts/);
});
