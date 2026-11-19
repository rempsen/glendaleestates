// Task 13: migration 0012 — buyer quote header RPC, request_quote_change RPC, review comment length.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { CHANGE_REQUEST_MAX, REVIEW_COMMENT_MAX } from '../src/lib/myQuoteModel';
import { DEFAULT_ASSIGNEE_KEY } from '../supabase/functions/_shared/pricingQueue';

const root = join(import.meta.dir, '..');
const migDir = join(root, 'drizzle/migrations');
const metaDir = join(migDir, 'meta');
const sqlPath = join(migDir, '0012_buyer_change_request.sql');
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('migration 0012 buyer change request', () => {
  const sql = existsSync(sqlPath) ? readFileSync(sqlPath, 'utf8') : '';
  const stmts = splitSqlStatements(sql).map(stripLeadingComments).map(squash);
  const header = stmts.find((s) => s.startsWith('CREATE OR REPLACE FUNCTION public.get_my_quote_header()')) ?? '';
  const req = stmts.find((s) => s.startsWith('CREATE OR REPLACE FUNCTION public.request_quote_change(_text text)')) ?? '';

  test('statements: settings key, two definer functions with owner/revoke/grant, queue view, guarded constraint', () => {
    expect(stmts).toHaveLength(12);
    expect(stmts[0]).toBe(
      `INSERT INTO public.portal_settings (key, value) VALUES ('${DEFAULT_ASSIGNEE_KEY}', 'null'::jsonb) ON CONFLICT (key) DO NOTHING`,
    );
    expect(stmts[1]).toStartWith('CREATE OR REPLACE FUNCTION public.get_my_quote_header()');
    expect(stmts[2]).toBe('ALTER FUNCTION public.get_my_quote_header() OWNER TO postgres');
    expect(stmts[3]).toBe('REVOKE ALL ON FUNCTION public.get_my_quote_header() FROM PUBLIC, anon');
    expect(stmts[4]).toBe('GRANT EXECUTE ON FUNCTION public.get_my_quote_header() TO authenticated');
    expect(stmts[5]).toStartWith('CREATE OR REPLACE FUNCTION public.request_quote_change(_text text)');
    expect(stmts[6]).toBe('ALTER FUNCTION public.request_quote_change(text) OWNER TO postgres');
    expect(stmts[7]).toBe('REVOKE ALL ON FUNCTION public.request_quote_change(text) FROM PUBLIC, anon');
    expect(stmts[8]).toBe('GRANT EXECUTE ON FUNCTION public.request_quote_change(text) TO authenticated');
    expect(stmts[9]).toStartWith('CREATE OR REPLACE VIEW public.pricing_queue WITH (security_invoker = true) AS');
    expect(stmts[10]).toBe('GRANT SELECT ON public.pricing_queue TO authenticated');
    expect(stmts[11]).toStartWith("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_reviews_comment_length')");
    expect(stmts[11]).toContain(`CHECK (comment IS NULL OR char_length(comment) <= ${REVIEW_COMMENT_MAX})`);
  });

  test('pricing_queue: same columns as 0006, plus unassigned open buyer requests', () => {
    const v0006 = squash(readFileSync(join(migDir, '0006_quote_lines.sql'), 'utf8'));
    const cols = (v: string) => v.slice(v.indexOf('AS SELECT') + 9, v.indexOf(' FROM public.quote_lines ql'));
    const old = v0006.slice(v0006.indexOf('CREATE OR REPLACE VIEW public.pricing_queue'));
    expect(cols(stmts[9])).toBe(cols(old));
    expect(stmts[9]).toContain('LEFT JOIN public.profiles p ON p.user_id = ql.flagged_to');
    expect(stmts[9]).toEndWith(
      "WHERE ql.status = 'pending' AND (ql.flagged_to IS NOT NULL OR ql.source = 'buyer_request') AND public.is_staff(auth.uid())",
    );
  });

  test('header: caller email only, explicit buyer-safe columns, newest first', () => {
    expect(header).toContain('SECURITY DEFINER SET search_path = public');
    expect(header).toContain("lower(bs.email) = lower(auth.jwt() ->> 'email')");
    expect(header).toContain('auth.uid() IS NOT NULL');
    expect(header).toContain('ORDER BY bs.created_at DESC, bs.id DESC');
    expect(header).not.toMatch(/\bbs\.\*|admin_notes|sales_comments|custom_pricing|area_upgrades|comments/);
  });

  test('request_quote_change: validates text, own submission only, pending buyer_request flagged to staff', () => {
    expect(req).toContain('SECURITY DEFINER SET search_path = public');
    expect(req).toContain("lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''))");
    expect(req).toContain('IF auth.uid() IS NULL OR _email IS NULL THEN');
    // Trims spaces, tabs and newlines; whitespace-only text is refused.
    expect(req).toContain("_body text := btrim(coalesce(_text, ''), E' \\t\\r\\n');");
    expect(req).toContain(`IF _body !~ '\\S' OR char_length(_body) > ${CHANGE_REQUEST_MAX} THEN`);
    // The submission comes from the caller's email, never from an argument.
    expect(req).toContain('WHERE lower(bs.email) = _email ORDER BY bs.created_at DESC, bs.id DESC LIMIT 1');
    expect(req).not.toMatch(/_submission_id|submission_id uuid/);
    expect(req).toContain("RAISE EXCEPTION 'No quote found for this sign-in'");
    // label on one line (email subjects); client_note as typed.
    expect(req).toContain("_label := regexp_replace(_body, '[\\r\\n]+', ' ', 'g');");
    expect(req).toContain(
      "VALUES (_submission, _sort, 'other', 'Buyer request', _label, 'flat', 'manual', 'pending', true, _body, 'buyer_request', _rep)",
    );
    expect(req).toContain("ql.source = 'buyer_request' AND ql.status = 'pending') >= 20");
    expect(req).toContain('RETURNING id INTO _id');
  });

  test('request_quote_change refuses an un-itemised quote (no stored line other than buyer requests), before the insert', () => {
    const guard = "IF NOT EXISTS (SELECT 1 FROM public.quote_lines ql WHERE ql.submission_id = _submission AND ql.source <> 'buyer_request') THEN "
      + "RAISE EXCEPTION 'This quote has not been itemised yet; please contact the office' USING ERRCODE = 'P0002'; END IF;";
    expect(req).toContain(guard);
    expect(req.indexOf(guard)).toBeGreaterThan(req.indexOf("RAISE EXCEPTION 'No quote found for this sign-in'"));
    expect(req.indexOf(guard)).toBeLessThan(req.indexOf('INSERT INTO public.quote_lines'));
  });

  test('rep fallback order: last staff line editor → pricing_default_assignee (staff only) → NULL', () => {
    const editor = req.indexOf('SELECT e.user_id INTO _rep');
    const fallback = req.indexOf('IF _rep IS NULL THEN');
    const insert = req.indexOf('INSERT INTO public.quote_lines');
    expect(editor).toBeGreaterThan(0);
    expect(fallback).toBeGreaterThan(editor);
    expect(insert).toBeGreaterThan(fallback);
    // Branch 1: staff editors only, present in profiles (flagged_to FK), newest edit first.
    expect(req).toContain("al.action_type IN ('quote_line_insert', 'quote_line_update')");
    expect(req).toContain('JOIN public.profiles p ON p.user_id = e.user_id WHERE public.is_staff(e.user_id) ORDER BY e.edited_at DESC LIMIT 1;');
    // Branch 2: the setting, only when it is a uuid naming a staff profile; otherwise _rep stays NULL (branch 3).
    expect(req.slice(fallback, insert)).toContain(
      `SELECT ps.value #>> '{}' INTO _default FROM public.portal_settings ps WHERE ps.key = '${DEFAULT_ASSIGNEE_KEY}';`,
    );
    expect(req.slice(fallback, insert)).toContain("IF _default ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN");
    expect(req.slice(fallback, insert)).toContain('WHERE p.user_id = _default::uuid AND public.is_staff(p.user_id);');
  });

  test('no policy, no grant on base tables, no non-idempotent DDL', () => {
    expect(sql).not.toMatch(/CREATE POLICY|ALTER POLICY|GRANT (INSERT|UPDATE|ALL) ON (TABLE )?public\./i);
    expect(sql.match(/GRANT SELECT ON [\w.]+/g)).toEqual(['GRANT SELECT ON public.pricing_queue']);
    expect(sql).not.toMatch(/CREATE TABLE|CREATE (UNIQUE )?INDEX|DROP /);
    expect(sql).not.toMatch(/CREATE FUNCTION/);
  });

  test('journal entry 12 follows 11 and every journal tag has a SQL file', () => {
    const journal = readJson(join(metaDir, '_journal.json'));
    const e11 = journal.entries.find((e: { idx: number }) => e.idx === 11);
    const e12 = journal.entries.find((e: { idx: number }) => e.idx === 12);
    expect(e12).toMatchObject({ tag: '0012_buyer_change_request', version: '7', when: 1795800000000, breakpoints: true });
    expect(e12.when).toBeGreaterThan(e11.when);
    expect(journal.entries.map((e: { idx: number }) => e.idx)).toEqual(journal.entries.map((_: unknown, i: number) => i));
    const files = readdirSync(migDir).filter((f) => f.endsWith('.sql'));
    for (const e of journal.entries) expect(files).toContain(`${e.tag}.sql`);
  });

  test('snapshot 0012 chains from 0011 with no table changes', () => {
    const s11 = readJson(join(metaDir, '0011_snapshot.json'));
    const s12 = readJson(join(metaDir, '0012_snapshot.json'));
    expect(s12.prevId).toBe(s11.id);
    expect(s12.id).not.toBe(s11.id);
    expect(s12.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s12.tables).toEqual({});
  });
});
