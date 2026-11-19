// Task 16 fix round 1: migration 0014 — staff read and write their own submission_audit_logs rows.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0014_staff_audit_log.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0014 staff audit log', () => {
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);

  test('exactly the two idempotent staff policies', () => {
    expect(stmts).toEqual([
      'DROP POLICY IF EXISTS "Staff view audit logs" ON public.submission_audit_logs',
      'CREATE POLICY "Staff view audit logs" ON public.submission_audit_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
      'DROP POLICY IF EXISTS "Staff add audit logs" ON public.submission_audit_logs',
      'CREATE POLICY "Staff add audit logs" ON public.submission_audit_logs FOR INSERT TO authenticated '
        + "WITH CHECK (public.is_staff(auth.uid()) AND changed_by_user_id = auth.uid() AND action_type <> 'pricing_request_notified')",
    ]);
  });

  test('admin policies untouched; no UPDATE / DELETE grants', () => {
    expect(stmts.join("\n")).not.toMatch(/Admins can (view all|insert) audit logs/);
    expect(stmts.join('\n')).not.toMatch(/FOR (UPDATE|DELETE|ALL)|ALTER TABLE|CREATE TABLE/);
  });

  test('the excluded action_type is the 0011 dedupe claim', () => {
    expect(readFileSync(join(root, 'supabase/functions/notify-pricing-request/index.ts'), 'utf8')).toContain("action_type: 'pricing_request_notified'");
  });

  test('journal entry 14 follows 13 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e13 = journal.entries.find((e: { idx: number }) => e.idx === 13);
    const e14 = journal.entries.find((e: { idx: number }) => e.idx === 14);
    expect(e14).toEqual({ idx: 14, version: '7', when: 1796000000000, tag: '0014_staff_audit_log', breakpoints: true });
    expect(e14.when).toBeGreaterThan(e13.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0014 chains from 0013 with no table changes', () => {
    const s13 = readJson(join(metaDir, '0013_snapshot.json'));
    const s14 = readJson(join(metaDir, '0014_snapshot.json'));
    expect(s14.prevId).toBe(s13.id);
    expect(s14.id).not.toBe(s13.id);
    expect(s14.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s14.tables).toEqual({});
  });
});
