// Task 8 fix round 1 (controller ruling): staff_directory() lets staff (not only admins) see who they can flag.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { peopleFromDirectory } from '../src/lib/addLinePresets';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0009_staff_directory.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0009 staff_directory', () => {
  const stmts = existsSync(sqlPath) ? splitSqlStatements(readFileSync(sqlPath, 'utf8')).map(stripLeadingComments).map(squash) : [];

  test('four statements: function, owner, revoke, grant', () => {
    expect(stmts).toHaveLength(4);
    expect(stmts[1]).toBe('ALTER FUNCTION public.staff_directory() OWNER TO postgres');
    expect(stmts[2]).toBe('REVOKE ALL ON FUNCTION public.staff_directory() FROM PUBLIC, anon');
    expect(stmts[3]).toBe('GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated');
  });

  test('function is SECURITY DEFINER, pinned search_path, and gated on is_staff(auth.uid())', () => {
    const f = stmts[0];
    expect(f).toStartWith('CREATE OR REPLACE FUNCTION public.staff_directory()');
    expect(f).toContain('RETURNS TABLE (user_id uuid, email text, first_name text, last_name text, role text)');
    expect(f).toContain('LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$');
    expect(f).toContain('FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.user_id');
    expect(f).toContain("WHERE ur.role::text IN ('admin', 'staff') AND public.is_staff(auth.uid())");
    expect(f).toContain('ORDER BY p.last_name, p.first_name');
    expect(f).not.toMatch(/phone_number|unit_number/); // directory only: no buyer-ish profile columns
  });

  test('journal entry 9 follows 8 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e8 = journal.entries.find((e: { idx: number }) => e.idx === 8);
    const e9 = journal.entries.find((e: { idx: number }) => e.idx === 9);
    expect(e9).toMatchObject({ tag: '0009_staff_directory', version: '7', breakpoints: true });
    expect(e9.when).toBeGreaterThan(e8.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0009 chains from 0008 with no table changes', () => {
    const s8 = readJson(join(metaDir, '0008_snapshot.json'));
    const s9 = readJson(join(metaDir, '0009_snapshot.json'));
    expect(s9.prevId).toBe(s8.id);
    expect(s9.id).not.toBe(s8.id);
    expect(s9.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s9.tables).toEqual({});
  });

  test('the console reads people from the RPC, not user_roles', () => {
    const page = readFileSync(join(root, 'src/pages/QuoteConsole.tsx'), 'utf8');
    expect(page).toContain("supabase.rpc('staff_directory')");
    expect(page).not.toContain("from('user_roles')");
  });

  test('peopleFromDirectory merges duplicate roles and sorts by name', () => {
    expect(peopleFromDirectory([
      { user_id: 'b', email: 'b@x', first_name: 'Brian', last_name: 'C' },
      { user_id: 'a', email: 'a@x', first_name: 'Ann', last_name: null },
      { user_id: 'b', email: 'b@x', first_name: 'Brian', last_name: 'C' },
      { user_id: 'n', email: 'n@x', first_name: null, last_name: null },
    ])).toEqual([
      { user_id: 'a', name: 'Ann', email: 'a@x' },
      { user_id: 'b', name: 'Brian C', email: 'b@x' },
      { user_id: 'n', name: 'n@x', email: 'n@x' },
    ]);
  });
});
