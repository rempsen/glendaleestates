import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { splitSqlStatements, stripLeadingComments, tryParse } from './lib/parseSql';

const root = join(import.meta.dir, '..');
const sqlPath = join(root, 'drizzle/migrations/0006_quote_lines.sql');
const metaDir = join(root, 'drizzle/migrations/meta');

function loadSql(): string {
  expect(existsSync(sqlPath)).toBe(true);
  return readFileSync(sqlPath, 'utf8');
}

/** Body of `CREATE TABLE IF NOT EXISTS public.<name> ( … );` */
function tableBody(sql: string, name: string): string {
  const stmt = splitSqlStatements(sql)
    .map(stripLeadingComments)
    .find((s) => new RegExp(`^CREATE TABLE IF NOT EXISTS public\\.${name}\\s*\\(`, 'i').test(s));
  expect(stmt, `CREATE TABLE ${name}`).toBeDefined();
  return stmt!;
}

function hasColumn(body: string, col: string, type?: RegExp): boolean {
  const line = body.split('\n').find((l) => new RegExp(`^\\s*${col}\\s`, 'i').test(l));
  if (!line) return false;
  return type ? type.test(line) : true;
}

const NEW_TABLES = ['quote_lines', 'unit_base_spec', 'quote_line_reviews', 'quote_snapshots', 'documents'];

describe('migration 0006 quote_lines', () => {
  test('first statement adds the staff role', () => {
    const first = stripLeadingComments(splitSqlStatements(loadSql())[0]);
    expect(first).toMatch(/^ALTER TYPE public\.app_role ADD VALUE IF NOT EXISTS 'staff'$/);
  });

  test('quote_lines has every spec §6.1 column with the right type', () => {
    const body = tableBody(loadSql(), 'quote_lines');
    const cols: Array<[string, RegExp]> = [
      ['id', /uuid PRIMARY KEY/i],
      ['submission_id', /uuid NOT NULL REFERENCES public\.buyer_selections\(id\)/i],
      ['sort_order', /int(eger)?\b/i],
      ['section', /text NOT NULL/i],
      ['location', /text/i],
      ['label', /text NOT NULL/i],
      ['product_name', /text/i],
      ['product_colour', /text/i],
      ['material_key', /text/i],
      ['quantity', /numeric/i],
      ['unit', /text/i],
      ['unit_price', /numeric/i],
      ['amount', /numeric/i],
      ['pricing_mode', /text NOT NULL/i],
      ['price_source_ref', /text/i],
      ['status', /text NOT NULL/i],
      ['counts_in_total', /boolean GENERATED ALWAYS AS/i],
      ['client_visible', /boolean NOT NULL DEFAULT true/i],
      ['client_note', /text/i],
      ['internal_note', /text/i],
      ['source', /text NOT NULL/i],
      ['flagged_to', /uuid/i],
      ['flagged_at', /timestamptz/i],
      ['answered_by', /uuid/i],
      ['answered_at', /timestamptz/i],
      ['provisional', /boolean NOT NULL DEFAULT false/i],
      ['wizard_field', /text/i],
      ['created_by', /uuid/i],
      ['updated_by', /uuid/i],
      ['created_at', /timestamptz NOT NULL DEFAULT now\(\)/i],
      ['updated_at', /timestamptz NOT NULL DEFAULT now\(\)/i],
    ];
    for (const [c, t] of cols) expect(hasColumn(body, c, t), `quote_lines.${c}`).toBe(true);
  });

  test('counts_in_total is the exact stored generated expression', () => {
    const body = tableBody(loadSql(), 'quote_lines');
    expect(body).toMatch(
      /counts_in_total\s+boolean GENERATED ALWAYS AS \(status = 'upgrade' AND amount IS NOT NULL\) STORED/,
    );
  });

  test('quote_lines enums are CHECK constraints with the spec values', () => {
    const body = tableBody(loadSql(), 'quote_lines');
    const checks: Record<string, string[]> = {
      section: ['standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other'],
      unit: ['sqft', 'sqyd', 'each', 'flat'],
      pricing_mode: ['catalog', 'flat_rate', 'manual', 'included'],
      status: ['included', 'upgrade', 'pending', 'under_review', 'deferred', 'removed'],
      source: ['wizard', 'office', 'buyer_request', 'migration'],
    };
    for (const [col, values] of Object.entries(checks)) {
      const list = values.map((v) => `'${v}'`).join(', ');
      expect(body, col).toContain(`CHECK (${col} IN (${list}))`);
    }
  });

  test('companion tables have their spec columns', () => {
    const sql = loadSql();
    const ubs = tableBody(sql, 'unit_base_spec');
    for (const c of ['unit_type_code', 'section', 'location', 'label', 'default_product', 'default_colour_options', 'is_included'])
      expect(hasColumn(ubs, c), `unit_base_spec.${c}`).toBe(true);
    expect(hasColumn(ubs, 'default_colour_options', /jsonb/i)).toBe(true);
    expect(hasColumn(ubs, 'is_included', /boolean/i)).toBe(true);

    const qlr = tableBody(sql, 'quote_line_reviews');
    for (const c of ['id', 'line_id', 'buyer_user_id', 'response', 'comment', 'created_at'])
      expect(hasColumn(qlr, c), `quote_line_reviews.${c}`).toBe(true);
    expect(qlr).toContain("CHECK (response IN ('accepted', 'questioned'))");
    expect(hasColumn(qlr, 'line_id', /REFERENCES public\.quote_lines\(id\)/i)).toBe(true);

    const qs = tableBody(sql, 'quote_snapshots');
    for (const c of ['id', 'submission_id', 'version', 'lines', 'subtotal', 'gst', 'total', 'created_by', 'created_at', 'purpose'])
      expect(hasColumn(qs, c), `quote_snapshots.${c}`).toBe(true);
    expect(hasColumn(qs, 'lines', /jsonb/i)).toBe(true);
    expect(qs).toContain("CHECK (purpose IN ('quote', 'change_order', 'contract'))");

    const docs = tableBody(sql, 'documents');
    for (const c of ['id', 'submission_id', 'snapshot_id', 'kind', 'storage_path', 'provider', 'provider_envelope_id', 'status', 'signed_at', 'signer_email', 'uploaded_by'])
      expect(hasColumn(docs, c), `documents.${c}`).toBe(true);
    expect(docs).toContain("CHECK (kind IN ('selection_sheet', 'change_order', 'purchase_agreement', 'deposit_receipt', 'other'))");
    expect(docs).toContain("CHECK (status IN ('draft', 'sent', 'signed', 'declined', 'voided'))");
  });

  test('every new table has RLS enabled and at least one policy', () => {
    const sql = loadSql();
    for (const t of NEW_TABLES) {
      expect(sql, t).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(sql, t).toMatch(new RegExp(`CREATE POLICY "[^"]+" ON public\\.${t}\\b`));
    }
  });

  test('is_staff is SECURITY DEFINER STABLE and never dereferences the staff enum literal', () => {
    const sql = loadSql();
    const fn = splitSqlStatements(sql).map(stripLeadingComments).find((s) => /FUNCTION public\.is_staff\(/i.test(s));
    expect(fn).toBeDefined();
    expect(fn!).toMatch(/STABLE SECURITY DEFINER SET search_path = public/);
    expect(fn!).toContain("role::text IN ('admin', 'staff')");
    expect(/'staff'::(public\.)?app_role/.test(sql), "no 'staff'::app_role").toBe(false);
    expect(/has_role\([^)]*'staff'/.test(sql), "no has_role(…'staff')").toBe(false);
  });

  test('buyer policies are scoped to client_visible lines of their own submission', () => {
    const sql = loadSql();
    const pol = splitSqlStatements(sql).map(stripLeadingComments).find((s) => s.startsWith('CREATE POLICY "Buyers view own visible quote lines"'));
    expect(pol).toBeDefined();
    expect(pol!).toMatch(/FOR SELECT TO authenticated/);
    expect(pol!).toContain('client_visible');
    expect(pol!).toContain("lower(bs.email) = lower(auth.jwt() ->> 'email')");
    const reviews = splitSqlStatements(sql).map(stripLeadingComments).filter((s) => /^CREATE POLICY "Buyers [^"]+" ON public\.quote_line_reviews/.test(s));
    expect(reviews.length).toBe(2);
    for (const r of reviews) {
      expect(r).toContain('buyer_user_id = auth.uid()');
      expect(r).toContain('ql.client_visible');
    }
  });

  test('pricing_queue view, triggers, guard and bucket', () => {
    const sql = loadSql();
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.pricing_queue\s+WITH \(security_invoker = true\) AS/);
    expect(sql).toMatch(/ql\.status = 'pending'/);
    expect(sql).toMatch(/ql\.flagged_to IS NOT NULL/);
    expect(sql).toContain('AS age_hours');
    expect(sql).toContain('GRANT SELECT ON public.pricing_queue TO authenticated;');
    expect(sql).toMatch(/CREATE TRIGGER quote_lines_audit AFTER INSERT OR UPDATE OR DELETE ON public\.quote_lines/);
    for (const a of ['quote_line_insert', 'quote_line_update', 'quote_line_delete']) expect(sql).toContain(`'${a}'`);
    expect(sql).toMatch(/CREATE TRIGGER set_updated_at BEFORE UPDATE ON public\.quote_lines/);
    expect(sql).toMatch(/CREATE TRIGGER set_updated_at BEFORE UPDATE ON public\.documents/);
    expect(sql).toMatch(/FUNCTION public\.guard_custom_pricing\(\)[\s\S]*NOT public\.is_staff\(auth\.uid\(\)\)/);
    expect(sql).toContain("insert into storage.buckets (id, name, public) values ('unit-documents', 'unit-documents', false) on conflict do nothing;");
    expect(sql).toMatch(/CREATE POLICY "Staff manage unit documents" ON storage\.objects/);
  });

  test('journal and snapshot are consistent with 0005', () => {
    const journal = JSON.parse(readFileSync(join(metaDir, '_journal.json'), 'utf8'));
    const e6 = journal.entries.find((e: { idx: number }) => e.idx === 6);
    const e5 = journal.entries.find((e: { idx: number }) => e.idx === 5);
    expect(e6).toBeDefined();
    expect(e6.tag).toBe('0006_quote_lines');
    expect(e6.version).toBe('7');
    expect(e6.breakpoints).toBe(true);
    expect(e6.when).toBeGreaterThan(e5.when);
    const s5 = JSON.parse(readFileSync(join(metaDir, '0005_snapshot.json'), 'utf8'));
    const s6 = JSON.parse(readFileSync(join(metaDir, '0006_snapshot.json'), 'utf8'));
    expect(s6.prevId).toBe(s5.id);
    expect(s6.id).not.toBe(s5.id);
    expect(s6.tables).toEqual({});
    expect({ ...s6, id: s5.id, prevId: s5.prevId }).toEqual(s5);
  });

  test('every statement parses with pgsql-ast-parser except the explicit skip list', () => {
    const stmts = splitSqlStatements(loadSql()).map(stripLeadingComments);
    // Statement kinds pgsql-ast-parser 12 cannot model, with their exact counts.
    const SKIP: Array<[RegExp, number]> = [
      [/^ALTER TYPE \S+ ADD VALUE/i, 1],
      [/^CREATE OR REPLACE FUNCTION /i, 3],
      [/^DROP TRIGGER /i, 3],
      [/^CREATE TRIGGER /i, 3],
      [/^GRANT /i, 1],
      [/^ALTER TABLE \S+ ENABLE ROW LEVEL SECURITY$/i, 5],
      [/^DROP POLICY /i, 10],
      [/^CREATE POLICY /i, 10],
      [/^CREATE OR REPLACE VIEW \S+ WITH \(/i, 1],
    ];
    for (const [re, n] of SKIP) expect(stmts.filter((s) => re.test(s)).length, String(re)).toBe(n);
    const parsed = stmts.filter((s) => !SKIP.some(([re]) => re.test(s)));
    expect(parsed.length).toBe(stmts.length - SKIP.reduce((a, [, n]) => a + n, 0));
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.map(tryParse).filter((r) => !r.ok)).toEqual([]);
  });

  test('the parts of skipped statements the parser can model also parse', () => {
    const stmts = splitSqlStatements(loadSql()).map(stripLeadingComments);
    const extra: string[] = [];
    // The view body without its WITH (security_invoker) option.
    const view = stmts.find((s) => s.startsWith('CREATE OR REPLACE VIEW'))!;
    extra.push(view.replace(/ WITH \(security_invoker = true\)/, ''));
    // The is_staff SQL body.
    const isStaff = stmts.find((s) => /FUNCTION public\.is_staff\(/.test(s))!;
    extra.push(/\$\$([\s\S]*)\$\$/.exec(isStaff)![1]);
    // Every policy USING / WITH CHECK predicate, as SELECT <expr>.
    for (const pol of stmts.filter((s) => s.startsWith('CREATE POLICY'))) {
      for (const expr of policyPredicates(pol)) extra.push(`SELECT ${expr}`);
    }
    // 1 view + 1 function body + 16 predicates from 10 policies.
    expect(extra.length).toBe(18);
    expect(extra.map(tryParse).filter((r) => !r.ok)).toEqual([]);
  });

  test('generated types include the new tables, view and staff role', () => {
    const types = readFileSync(join(root, 'src/integrations/supabase/types.ts'), 'utf8');
    // Boolean assertions keep a failure from dumping the whole 1,200-line file.
    for (const t of [...NEW_TABLES, 'pricing_queue'])
      expect(new RegExp(`\\n      ${t}: \\{\\n        Row: \\{`).test(types), t).toBe(true);
    expect(types.includes('app_role: "admin" | "user" | "staff"'), 'Enums.app_role').toBe(true);
    expect(types.includes('app_role: ["admin", "user", "staff"]'), 'Constants.app_role').toBe(true);
    expect(/is_staff: \{\n\s+Args: \{ _user_id: string \}\n\s+Returns: boolean/.test(types), 'is_staff fn').toBe(true);
  });
});

/** Balanced-paren contents of each USING ( … ) and WITH CHECK ( … ) clause. */
function policyPredicates(stmt: string): string[] {
  const out: string[] = [];
  const re = /\b(USING|WITH CHECK)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stmt))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < stmt.length && depth > 0) {
      if (stmt[i] === '(') depth++;
      else if (stmt[i] === ')') depth--;
      i++;
    }
    out.push(stmt.slice(start, i - 1));
  }
  return out;
}
