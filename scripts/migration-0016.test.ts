// Final fix wave (I3): migration 0016 — signed records not staff-mutable, staff read-only buyer reviews, predicate
// grants, quote_lines.updated_by stamp. Pins every policy. Never run against a database here (scripts/rls-smoke does).
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { FORBIDDEN_WRITE_KEYS } from '../src/lib/quoteLinesReducer';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0016_phase2_hardening.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0016 phase 2 hardening', () => {
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);
  const all = stmts.join('\n');
  const policy = (name: string) => stmts.find((s) => s.startsWith(`CREATE POLICY "${name}"`)) ?? '';

  test('exact statement list (idempotent: every CREATE POLICY / TRIGGER is preceded by its DROP IF EXISTS)', () => {
    expect(stmts).toEqual([
      'DROP POLICY IF EXISTS "Staff manage documents" ON public.documents',
      'DROP POLICY IF EXISTS "Staff view documents" ON public.documents',
      'CREATE POLICY "Staff view documents" ON public.documents FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
      'DROP POLICY IF EXISTS "Staff add documents" ON public.documents',
      'CREATE POLICY "Staff add documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()))',
      'DROP POLICY IF EXISTS "Staff update unsigned documents" ON public.documents',
      'CREATE POLICY "Staff update unsigned documents" ON public.documents FOR UPDATE TO authenticated '
        + "USING (public.is_staff(auth.uid()) AND status IN ('draft', 'sent')) "
        + "WITH CHECK (public.is_staff(auth.uid()) AND status IN ('draft', 'sent', 'voided'))",
      'DROP POLICY IF EXISTS "Staff manage unit documents" ON storage.objects',
      'DROP POLICY IF EXISTS "Staff view unit documents" ON storage.objects',
      'CREATE POLICY "Staff view unit documents" ON storage.objects FOR SELECT TO authenticated '
        + "USING (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()))",
      'DROP POLICY IF EXISTS "Staff add unit documents" ON storage.objects',
      'CREATE POLICY "Staff add unit documents" ON storage.objects FOR INSERT TO authenticated '
        + "WITH CHECK (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()))",
      'DROP POLICY IF EXISTS "Staff manage quote line reviews" ON public.quote_line_reviews',
      'DROP POLICY IF EXISTS "Staff view quote line reviews" ON public.quote_line_reviews',
      'CREATE POLICY "Staff view quote line reviews" ON public.quote_line_reviews FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
      'REVOKE EXECUTE ON FUNCTION public.is_staff(uuid), public.buyer_can_see_line(uuid) FROM PUBLIC, anon',
      'GRANT EXECUTE ON FUNCTION public.is_staff(uuid), public.buyer_can_see_line(uuid) TO authenticated',
      'CREATE OR REPLACE FUNCTION public.quote_lines_set_updated_by() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ '
        + 'BEGIN NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); RETURN NEW; END; $$',
      'DROP TRIGGER IF EXISTS quote_lines_set_updated_by ON public.quote_lines',
      'CREATE TRIGGER quote_lines_set_updated_by BEFORE UPDATE ON public.quote_lines FOR EACH ROW EXECUTE FUNCTION public.quote_lines_set_updated_by()',
    ]);
  });

  test('documents: staff never DELETE and never edit a signed / declined / voided row; the only new status is voided', () => {
    expect(all).not.toMatch(/ON public\.documents FOR (ALL|DELETE)/);
    const upd = policy('Staff update unsigned documents');
    expect(upd).toContain("USING (public.is_staff(auth.uid()) AND status IN ('draft', 'sent'))");
    expect(upd).not.toMatch(/'signed'|'declined'/);
  });

  test('storage unit-documents: staff INSERT + SELECT only (no overwrite, no delete)', () => {
    expect(all).not.toMatch(/ON storage\.objects FOR (ALL|UPDATE|DELETE)/);
  });

  test('quote_line_reviews: staff SELECT only; the buyer policies are left alone', () => {
    expect(all).not.toMatch(/ON public\.quote_line_reviews FOR (ALL|INSERT|UPDATE|DELETE)/);
    expect(all).not.toContain('Buyers add own quote line reviews');
    expect(all).not.toContain('Buyers view own quote line reviews');
  });

  test('every CREATE POLICY / TRIGGER has a DROP IF EXISTS before it (re-runnable)', () => {
    stmts.forEach((s, i) => {
      const m = s.match(/^CREATE POLICY ("[^"]+") ON ([\w.]+)/) ?? s.match(/^CREATE TRIGGER (\w+) BEFORE \w+ ON ([\w.]+)/);
      if (!m) return;
      const drop = `DROP ${s.startsWith('CREATE POLICY') ? 'POLICY' : 'TRIGGER'} IF EXISTS ${m[1]} ON ${m[2]}`;
      expect(stmts.slice(0, i)).toContain(drop);
    });
    expect(all).not.toMatch(/CREATE TABLE|ALTER TABLE|DELETE FROM|TRUNCATE|UPDATE public\./i);
  });

  test('updated_by stays client-forbidden (the trigger owns it)', () => {
    expect(FORBIDDEN_WRITE_KEYS).toContain('updated_by');
  });

  test('journal entry 16 follows 15 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e15 = journal.entries.find((e: { idx: number }) => e.idx === 15);
    const e16 = journal.entries.find((e: { idx: number }) => e.idx === 16);
    expect(e16).toEqual({ idx: 16, version: '7', when: 1796200000000, tag: '0016_phase2_hardening', breakpoints: true });
    expect(e16.when).toBeGreaterThan(e15.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0016 chains from 0015 with no table changes', () => {
    const s15 = readJson(join(metaDir, '0015_snapshot.json'));
    const s16 = readJson(join(metaDir, '0016_snapshot.json'));
    expect(s16.prevId).toBe(s15.id);
    expect(s16.id).not.toBe(s15.id);
    expect(s16.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s16.tables).toEqual({});
  });
});
