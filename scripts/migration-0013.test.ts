// Task 14: migration 0013 — e-sign settings, provider-document lookup index; snapshot immutability (0006) pinned.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { DEFAULT_ESIGN_PROVIDER, DEFAULT_STATUS_AFTER_SIGNED, ESIGN_SETTINGS_KEYS } from '../supabase/functions/_shared/esign/documents';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0013_esign_settings.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0013 esign settings', () => {
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);

  test('statements: settings insert (never overwrites) and an IF NOT EXISTS partial unique index', () => {
    expect(stmts).toEqual([
      "INSERT INTO public.portal_settings (key, value) VALUES ('esign_provider', '\"signwell\"'::jsonb), "
        + "('esign_status_after_signed', '\"completed\"'::jsonb) ON CONFLICT (key) DO NOTHING",
      'CREATE UNIQUE INDEX IF NOT EXISTS documents_provider_envelope_key ON public.documents (provider, provider_envelope_id) '
        + 'WHERE provider_envelope_id IS NOT NULL',
    ]);
  });

  test('keys and defaults match the shared parser; the default status is a real buyer_selections status', () => {
    expect(stmts[0]).toContain(`'${ESIGN_SETTINGS_KEYS.provider}', '"${DEFAULT_ESIGN_PROVIDER}"'`);
    expect(stmts[0]).toContain(`'${ESIGN_SETTINGS_KEYS.statusAfterSigned}', '"${DEFAULT_STATUS_AFTER_SIGNED}"'`);
    expect(['reviewed', 'quoted', 'completed']).toContain(DEFAULT_STATUS_AFTER_SIGNED);
  });

  test('no secrets in settings and no storage / policy / table changes', () => {
    const body = stmts.join('\n');
    expect(body).not.toMatch(/SIGNWELL_|api_key|webhook_secret|secret/i);
    expect(body).not.toMatch(/storage\.|CREATE POLICY|CREATE TABLE|ALTER TABLE|DROP /i);
  });

  test('journal entry 13 follows 12 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e12 = journal.entries.find((e: { idx: number }) => e.idx === 12);
    const e13 = journal.entries.find((e: { idx: number }) => e.idx === 13);
    expect(e13).toEqual({ idx: 13, version: '7', when: 1795900000000, tag: '0013_esign_settings', breakpoints: true });
    expect(e13.when).toBeGreaterThan(e12.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0013 chains from 0012 with no table changes', () => {
    const s12 = readJson(join(metaDir, '0012_snapshot.json'));
    const s13 = readJson(join(metaDir, '0013_snapshot.json'));
    expect(s13.prevId).toBe(s12.id);
    expect(s13.id).not.toBe(s12.id);
    expect(s13.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s13.tables).toEqual({});
  });
});

describe('quote_snapshots immutability (0006) — pinned', () => {
  const sql = readFileSync(join(migDir, '0006_quote_lines.sql'), 'utf8');
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);
  test('trigger rejects every UPDATE and DELETE, for every role', () => {
    expect(stmts).toContain(
      'CREATE OR REPLACE FUNCTION public.quote_snapshots_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ '
        + "BEGIN RAISE EXCEPTION 'quote_snapshots are immutable'; END; $$",
    );
    expect(stmts).toContain('CREATE TRIGGER quote_snapshots_immutable BEFORE UPDATE OR DELETE ON public.quote_snapshots FOR EACH ROW EXECUTE FUNCTION public.quote_snapshots_immutable()');
  });
  test('staff RLS on quote_snapshots is SELECT and INSERT only', () => {
    const policies = stmts.filter((s) => s.startsWith('CREATE POLICY') && s.includes('ON public.quote_snapshots'));
    expect(policies.map((p) => /FOR (\w+)/.exec(p)?.[1]).sort()).toEqual(['INSERT', 'SELECT']);
    expect(stmts.some((s) => s.includes('UNIQUE (submission_id, version)'))).toBe(true);
  });
  test('unit-documents bucket is private and staff can write it (no new storage policy needed)', () => {
    expect(sql).toContain("insert into storage.buckets (id, name, public) values ('unit-documents', 'unit-documents', false) on conflict do nothing;");
    expect(stmts).toContain(
      'CREATE POLICY "Staff manage unit documents" ON storage.objects FOR ALL TO authenticated '
        + "USING (bucket_id = 'unit-documents' AND public.is_staff(auth.uid())) WITH CHECK (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()))",
    );
  });
});
