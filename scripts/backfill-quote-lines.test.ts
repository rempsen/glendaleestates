// Phase 2 Task 5: quote_lines backfill. Dry run = parity report only; --write inserts source='migration' lines
// for ok rows with no existing lines, once (Review Focus 5), never partially.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import expectedShape from './fixtures/quote-lines-expected.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import type { SubmissionRow } from './lib/generateInputFromRow';
import {
  runBackfill, parseArgs, formatTable, main, BackfillRefused, expectedShapeFromReport,
  type BackfillDb, type InsertLine,
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
}

function stubDb(existing: Record<string, number> = {}): Stub {
  const store = new Map<string, InsertLine[]>();
  for (const [id, n] of Object.entries(existing)) {
    store.set(id, Array.from({ length: n }, () => ({ submission_id: id, source: 'office' }) as unknown as InsertLine));
  }
  const calls = { insert: 0, delete: 0, list: 0 };
  const db: Stub = {
    store, calls,
    async listSubmissions() { calls.list++; return structuredClone(rows); },
    async countLines(id) { return store.get(id)?.length ?? 0; },
    async insertLines(lines) {
      calls.insert++;
      const id = lines[0].submission_id;
      // Simulate a failure after some rows landed (worst case for "never partial").
      if (db.failInsertFor === id) { store.set(id, lines.slice(0, 3)); throw new Error('simulated insert error'); }
      store.set(id, [...(store.get(id) ?? []), ...structuredClone(lines)]);
    },
    async deleteMigrationLines(id) {
      calls.delete++;
      store.set(id, (store.get(id) ?? []).filter((l) => l.source !== 'migration'));
    },
    async loadPricingRows() { return structuredClone(pricingSnapshot) as unknown as PricingSnapshot; },
  };
  return db;
}

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
    expect(db.calls.insert).toBe(0);
    expect(db.calls.delete).toBe(0);
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

describe('--write', () => {
  test('twice: inserts once per submission, second run reports 0 writes (idempotent)', async () => {
    const db = stubDb();
    const first = await runBackfill(db, { write: true, confirm: 'yes' });
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
    const second = await runBackfill(db, { write: true, confirm: 'yes' });
    expect(second.writes).toBe(0);
    expect(second.rows.every((r) => r.status === 'skipped: has lines')).toBe(true);
    expect(db.calls.insert).toBe(9);
    expect(JSON.stringify([...db.store])).toBe(before);
  });

  test('a deliberately altered amount → FAIL and excluded from writes', async () => {
    const db = stubDb();
    const target = idOf('31');
    const report = await runBackfill(db, { write: true, confirm: 'yes' }, {
      transformLines: (lines, row) => row.id !== target ? lines : lines.map((l, i) =>
        i === lines.findIndex((x) => x.status === 'upgrade' && (x.amount ?? 0) > 0) ? { ...l, amount: (l.amount as number) + 1 } : l),
    });
    const r31 = report.rows.find((r) => r.unit === '31')!;
    expect(r31.status).toBe('FAIL');
    expect(r31.reasons.length).toBeGreaterThan(0);
    expect(r31.lines_subtotal - r31.engine_subtotal).toBeCloseTo(1, 6);
    expect(r31.written).toBe(0);
    expect(db.store.get(target)).toBeUndefined();
    expect(report.writes).toBe(8);
    expect(formatTable(report)).toContain('FAIL Unit 31');
  });

  test('a submission that already has lines → skipped: has lines, untouched', async () => {
    const target = idOf('7');
    const db = stubDb({ [target]: 2 });
    const report = await runBackfill(db, { write: true, confirm: 'yes' });
    const r7 = report.rows.find((r) => r.unit === '7')!;
    expect(r7.status).toBe('skipped: has lines');
    expect(r7.written).toBe(0);
    expect(db.store.get(target)!.length).toBe(2);
    expect(report.writes).toBe(8);
    // Also reported in a dry run.
    expect((await runBackfill(stubDb({ [target]: 1 }), { write: false })).rows.find((r) => r.unit === '7')!.status)
      .toBe('skipped: has lines');
  });

  test('insert error → rolled back (no partial set) and FAIL', async () => {
    const db = stubDb();
    db.failInsertFor = idOf('43');
    const report = await runBackfill(db, { write: true, confirm: 'yes' });
    const r43 = report.rows.find((r) => r.unit === '43')!;
    expect(r43.status).toBe('FAIL');
    expect(r43.reasons.join(' ')).toContain('simulated insert error');
    expect(r43.written).toBe(0);
    expect(db.store.get(idOf('43'))).toEqual([]);
    expect(db.calls.delete).toBe(1);
    expect(report.writes).toBe(8);
  });

  test('without CONFIRM_BACKFILL=yes refuses before touching the database', async () => {
    for (const confirm of [undefined, '', 'no', 'YES ']) {
      const db = stubDb();
      await expect(runBackfill(db, { write: true, confirm })).rejects.toBeInstanceOf(BackfillRefused);
      expect(db.calls).toEqual({ insert: 0, delete: 0, list: 0 });
    }
  });
});

describe('CLI', () => {
  test('parseArgs', () => {
    expect(parseArgs([])).toEqual({ write: false, json: false, unit: undefined });
    expect(parseArgs(['--write', '--unit', '24', '--json'])).toEqual({ write: true, json: true, unit: '24' });
    expect(parseArgs(['--unit=7'])).toEqual({ write: false, json: false, unit: '7' });
    expect(() => parseArgs(['--unit'])).toThrow();
    expect(() => parseArgs(['--wirte'])).toThrow();
  });

  const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, log: (s: string) => out.push(s), error: (s: string) => err.push(s) }; };

  test('--write without CONFIRM_BACKFILL=yes exits 2 and never builds a db', async () => {
    const o = io();
    let built = 0;
    const code = await main(['--write'], { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' }, o, () => { built++; return stubDb(); });
    expect(code).toBe(2);
    expect(built).toBe(0);
    expect(o.err.join('\n')).toContain('CONFIRM_BACKFILL=yes');
  });

  test('missing env exits 2', async () => {
    const o = io();
    expect(await main([], {}, o, () => stubDb())).toBe(2);
    expect(o.err.join('\n')).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  test('--json prints the report as JSON; dry run exit 0', async () => {
    const o = io();
    const code = await main(['--json', '--unit', '24'], { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y' }, o, () => stubDb());
    expect(code).toBe(0);
    const parsed = JSON.parse(o.out.join('\n'));
    expect(parsed.mode).toBe('dry-run');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].status).toBe('ok');
  });

  test('a FAIL row makes the exit code 1', async () => {
    const o = io();
    const db = stubDb();
    db.failInsertFor = idOf('2');
    const code = await main(['--write'], { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'y', CONFIRM_BACKFILL: 'yes' }, o, () => db);
    expect(code).toBe(1);
  });
});

test('backfill builds inputs only through the shared builder (no inline mapping, no prices)', () => {
  const src = readFileSync(join(import.meta.dir, 'backfill-quote-lines.ts'), 'utf8');
  expect(src).toContain("from './lib/generateInputFromRow'");
  expect(src).not.toMatch(/toBuyerPdfSelections|computeUpgradeTotals\(|serverPricingFromRows/);
  expect(src).not.toMatch(/\b\d{2,}\.\d{2}\b/); // no hardcoded dollar amounts
  expect(src).not.toMatch(/buyer_selection_drafts/);
});
