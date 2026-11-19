// Fix round 1 (Task 6): quote_lines must be in the supabase_realtime publication or useQuoteLines' realtime never fires.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0008_quote_lines_realtime.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

describe('migration 0008 quote_lines realtime', () => {
  test('adds public.quote_lines to supabase_realtime, guarded by pg_publication_tables', () => {
    expect(existsSync(sqlPath)).toBe(true);
    const stmts = splitSqlStatements(readFileSync(sqlPath, 'utf8')).map(stripLeadingComments);
    expect(stmts).toHaveLength(1);
    const body = stmts[0];
    expect(body).toMatch(/^DO \$\$/);
    expect(body).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.quote_lines;/);
    expect(body).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_publication_tables/);
    expect(body).toMatch(/pubname = 'supabase_realtime'/);
    expect(body).toMatch(/schemaname = 'public'/);
    expect(body).toMatch(/tablename = 'quote_lines'/);
  });

  test('0006 (already applied) is unchanged: it still does not touch the publication', () => {
    expect(readFileSync(join(migDir, '0006_quote_lines.sql'), 'utf8')).not.toMatch(/supabase_realtime/);
  });

  test('journal entry 8 follows 7 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e7 = journal.entries.find((e: { idx: number }) => e.idx === 7);
    const e8 = journal.entries.find((e: { idx: number }) => e.idx === 8);
    expect(e8).toBeDefined();
    expect(e8.tag).toBe('0008_quote_lines_realtime');
    expect(e8.version).toBe('7');
    expect(e8.when).toBeGreaterThan(e7.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0008 chains from 0007 with no table changes', () => {
    const s7 = readJson(join(metaDir, '0007_snapshot.json'));
    const s8 = readJson(join(metaDir, '0008_snapshot.json'));
    expect(s8.prevId).toBe(s7.id);
    expect(s8.id).not.toBe(s7.id);
    expect(s8.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s8.tables).toEqual({});
    expect(s8.version).toBe(s7.version);
    expect(s8.dialect).toBe(s7.dialect);
  });
});
