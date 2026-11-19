// Task 10 fix round 1 (controller ruling): counted ⇒ client_visible, enforced in the DB (0010), at write time
// (quoteLinesReducer) and at render time (buildLineRows throws CountedHiddenLineError for the buyer copy).
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0010_counted_lines_visible.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0010 quote_lines_counted_visible', () => {
  const stmts = existsSync(sqlPath) ? splitSqlStatements(readFileSync(sqlPath, 'utf8')).map(stripLeadingComments).map(squash) : [];

  test('one idempotent DO block adding the CHECK constraint', () => {
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toBe(
      "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_lines_counted_visible') THEN "
      + 'ALTER TABLE public.quote_lines ADD CONSTRAINT quote_lines_counted_visible '
      + "CHECK (NOT (status = 'upgrade' AND amount IS NOT NULL AND client_visible = false)); END IF; END $$",
    );
  });

  test('the CHECK expression matches countsInTotal (status upgrade and amount not null)', async () => {
    const { countsInTotal } = await import('../supabase/functions/_shared/quoteLines.ts');
    expect(countsInTotal({ status: 'upgrade', amount: 1 })).toBe(true);
    expect(countsInTotal({ status: 'upgrade', amount: null })).toBe(false);
    expect(countsInTotal({ status: 'pending', amount: 1 })).toBe(false);
    expect(stmts[0]).toContain("status = 'upgrade' AND amount IS NOT NULL");
  });

  test('journal entry 10 follows 9 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e9 = journal.entries.find((e: { idx: number }) => e.idx === 9);
    const e10 = journal.entries.find((e: { idx: number }) => e.idx === 10);
    expect(e10).toMatchObject({ tag: '0010_counted_lines_visible', version: '7', breakpoints: true });
    expect(e10.when).toBeGreaterThan(e9.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0010 chains from 0009 with no table changes', () => {
    const s9 = readJson(join(metaDir, '0009_snapshot.json'));
    const s10 = readJson(join(metaDir, '0010_snapshot.json'));
    expect(s10.prevId).toBe(s9.id);
    expect(s10.id).not.toBe(s9.id);
    expect(s10.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s10.tables).toEqual({});
  });
});
