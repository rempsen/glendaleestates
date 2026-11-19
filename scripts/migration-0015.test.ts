// Task 17: migration 0015 — ai_monthly_token_cap setting (idempotent insert only). Never run against a database here.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { AI_TOKEN_CAP_KEY, DEFAULT_AI_MONTHLY_TOKEN_CAP, parseTokenCap } from '../supabase/functions/summarize-upgrade-requests/handler';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0015_ai_settings.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0015 ai settings', () => {
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);

  test('one statement: the cap setting, inserted without overwriting an existing value', () => {
    expect(stmts).toEqual([
      "INSERT INTO public.portal_settings (key, value) VALUES ('ai_monthly_token_cap', '2000000'::jsonb) ON CONFLICT (key) DO NOTHING",
    ]);
  });

  test('key and default match the function', () => {
    expect(stmts[0]).toContain(`'${AI_TOKEN_CAP_KEY}', '${DEFAULT_AI_MONTHLY_TOKEN_CAP}'::jsonb`);
    expect(DEFAULT_AI_MONTHLY_TOKEN_CAP).toBe(2_000_000);
    expect(parseTokenCap(JSON.parse('2000000'))).toBe(2_000_000);
  });

  test('no table / policy / storage / destructive changes', () => {
    expect(stmts.join('\n')).not.toMatch(/storage\.|CREATE POLICY|CREATE TABLE|ALTER TABLE|DROP |DELETE |UPDATE |TRUNCATE/i);
  });

  test('journal entry 15 follows 14 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e14 = journal.entries.find((e: { idx: number }) => e.idx === 14);
    const e15 = journal.entries.find((e: { idx: number }) => e.idx === 15);
    expect(e15).toEqual({ idx: 15, version: '7', when: 1796100000000, tag: '0015_ai_settings', breakpoints: true });
    expect(e15.when).toBeGreaterThan(e14.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0015 chains from 0014 with no table changes', () => {
    const s14 = readJson(join(metaDir, '0014_snapshot.json'));
    const s15 = readJson(join(metaDir, '0015_snapshot.json'));
    expect(s15.prevId).toBe(s14.id);
    expect(s15.id).not.toBe(s14.id);
    expect(s15.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s15.tables).toEqual({});
  });
});
