// Task 13: migration 0012 — buyer quote header RPC, request_quote_change RPC, review comment length.
import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments } from './lib/parseSql';
import { CHANGE_REQUEST_MAX, REVIEW_COMMENT_MAX } from '../src/lib/myQuoteModel';

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

  test('statements: two definer functions with owner/revoke/grant, guarded constraint', () => {
    expect(stmts).toHaveLength(9);
    expect(stmts[1]).toBe('ALTER FUNCTION public.get_my_quote_header() OWNER TO postgres');
    expect(stmts[2]).toBe('REVOKE ALL ON FUNCTION public.get_my_quote_header() FROM PUBLIC, anon');
    expect(stmts[3]).toBe('GRANT EXECUTE ON FUNCTION public.get_my_quote_header() TO authenticated');
    expect(stmts[5]).toBe('ALTER FUNCTION public.request_quote_change(text) OWNER TO postgres');
    expect(stmts[6]).toBe('REVOKE ALL ON FUNCTION public.request_quote_change(text) FROM PUBLIC, anon');
    expect(stmts[7]).toBe('GRANT EXECUTE ON FUNCTION public.request_quote_change(text) TO authenticated');
    expect(stmts[8]).toStartWith("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_reviews_comment_length')");
    expect(stmts[8]).toContain(`CHECK (comment IS NULL OR char_length(comment) <= ${REVIEW_COMMENT_MAX})`);
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
    expect(req).toContain(`char_length(_body) < 1 OR char_length(_body) > ${CHANGE_REQUEST_MAX}`);
    // The submission comes from the caller's email, never from an argument.
    expect(req).toContain('WHERE lower(bs.email) = _email ORDER BY bs.created_at DESC, bs.id DESC LIMIT 1');
    expect(req).not.toMatch(/_submission_id|submission_id uuid/);
    expect(req).toContain("RAISE EXCEPTION 'No quote found for this sign-in'");
    // Rep: staff only, must exist in profiles (flagged_to FK).
    expect(req).toContain('JOIN public.profiles p ON p.user_id = e.user_id WHERE public.is_staff(e.user_id)');
    expect(req).toContain(
      "VALUES (_submission, _sort, 'other', 'Buyer request', _body, 'flat', 'manual', 'pending', true, _body, 'buyer_request', _rep)",
    );
    expect(req).toContain("ql.source = 'buyer_request' AND ql.status = 'pending') >= 20");
    expect(req).toContain('RETURNING id INTO _id');
  });

  test('no policy, no grant on base tables, no non-idempotent DDL', () => {
    expect(sql).not.toMatch(/CREATE POLICY|ALTER POLICY|GRANT (INSERT|UPDATE|SELECT|ALL) ON (TABLE )?public\./i);
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
