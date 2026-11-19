// Task 12: migration 0011 — notification settings keys, flagged_at / answered_at stamping, notify dedupe index.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { SETTINGS_KEYS, DEFAULT_ESCALATION_HOURS } from '../supabase/functions/_shared/pricingQueue';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0011_portal_settings_notifications.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0011 portal_settings notifications', () => {
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);

  test('statements: settings insert, stamp function, trigger (drop + create), guarded unique index', () => {
    expect(stmts).toHaveLength(5);
    expect(stmts[0]).toBe(
      "INSERT INTO public.portal_settings (key, value) VALUES ('teams_webhook_url', 'null'::jsonb), "
      + "('pricing_escalation_hours', '4'::jsonb), ('pricing_digest_recipients', '[\"dan@bmdmaterials.com\"]'::jsonb) "
      + 'ON CONFLICT (key) DO NOTHING',
    );
    expect(stmts[1]).toStartWith('CREATE OR REPLACE FUNCTION public.quote_lines_flag_stamp()');
    expect(stmts[2]).toBe('DROP TRIGGER IF EXISTS quote_lines_flag_stamp ON public.quote_lines');
    expect(stmts[3]).toBe('CREATE TRIGGER quote_lines_flag_stamp BEFORE INSERT OR UPDATE ON public.quote_lines FOR EACH ROW EXECUTE FUNCTION public.quote_lines_flag_stamp()');
    expect(stmts[4]).toStartWith("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'submission_audit_logs_pricing_notify_key') THEN CREATE UNIQUE INDEX");
    expect(stmts[4]).toContain("ON public.submission_audit_logs ((changes ->> 'dedupe_key')) WHERE action_type = 'pricing_request_notified'");
  });

  test('keys and defaults match the shared parser', () => {
    for (const k of Object.values(SETTINGS_KEYS)) expect(stmts[0]).toContain(`'${k}'`);
    expect(stmts[0]).toContain(`'${DEFAULT_ESCALATION_HOURS}'::jsonb`);
  });

  test('flag stamp: set/changed flagged_to stamps now(), cleared clears; answering stamps answered_*', () => {
    const fn = stmts[1];
    expect(fn).toContain('IF NEW.flagged_to IS NULL THEN NEW.flagged_at := NULL;');
    expect(fn).toContain("ELSIF TG_OP = 'INSERT' THEN NEW.flagged_at := coalesce(NEW.flagged_at, now());");
    expect(fn).toContain('ELSIF NEW.flagged_to IS DISTINCT FROM OLD.flagged_to THEN NEW.flagged_at := now();');
    expect(fn).toContain("OLD.status IN ('pending', 'under_review') AND NEW.status IN ('included', 'upgrade', 'deferred')");
    expect(fn).toContain('NEW.answered_by := auth.uid();');
  });

  test('no pg_net trigger and no non-idempotent DDL (the webhook is configured in the dashboard)', () => {
    expect(sql).not.toMatch(/pg_net|net\.http_post|supabase_functions\.http_request/);
    expect(sql).not.toMatch(/CREATE TABLE(?! IF NOT EXISTS)/);
    expect(sql.replace(/CREATE UNIQUE INDEX submission_audit_logs_pricing_notify_key/, '')).not.toMatch(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/);
  });

  test('journal entry 11 follows 10 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e10 = journal.entries.find((e: { idx: number }) => e.idx === 10);
    const e11 = journal.entries.find((e: { idx: number }) => e.idx === 11);
    expect(e11).toMatchObject({ tag: '0011_portal_settings_notifications', version: '7', breakpoints: true });
    expect(e11.when).toBeGreaterThan(e10.when);
    expect(e11.when).toBeGreaterThan(1795600000000);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0011 chains from 0010 with no table changes', () => {
    const s10 = readJson(join(metaDir, '0010_snapshot.json'));
    const s11 = readJson(join(metaDir, '0011_snapshot.json'));
    expect(s11.prevId).toBe(s10.id);
    expect(s11.id).not.toBe(s10.id);
    expect(s11.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s11.tables).toEqual({});
  });
});
