// RLS smoke test (final fix wave I5). Runs ONLY against a LOCAL Supabase started with `supabase start` (Docker):
// applies drizzle migrations 0006–0016 to the local database, creates two buyers, one staff and one admin through the
// Auth admin API, and asserts the Phase 2 row-level-security boundaries through PostgREST with each user's own JWT.
// See ./README.md. Never point it at production: it refuses any URL that is not localhost / 127.0.0.1.
//
//   supabase start && bun run rls-smoke
//
// Env (defaults are the `supabase start` values printed by `supabase status -o env`):
//   API_URL (http://127.0.0.1:54321), DB_URL (postgresql://postgres:postgres@127.0.0.1:54322/postgres),
//   ANON_KEY, SERVICE_ROLE_KEY (required), RLS_SMOKE_FROM (first drizzle migration to apply, default 0006).
// Exit: 0 all checks pass; 1 a check failed; 2 setup error / refused.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = process.env;
const API_URL = env.API_URL ?? 'http://127.0.0.1:54321';
const DB_URL = env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ANON_KEY = env.ANON_KEY ?? '';
const SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY ?? '';
const FROM = env.RLS_SMOKE_FROM ?? '0006';
const LAST = '0016';
const PASSWORD = 'rls-smoke-Password-1!';

export const isLocal = (u: string): boolean => /^(https?|postgres(ql)?):\/\/([^@/]*@)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(u);

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
}

async function applyMigrations(sql: postgres.Sql) {
  const dir = join(import.meta.dir, '../../drizzle/migrations');
  const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f.slice(0, 4) >= FROM && f.slice(0, 4) <= LAST).sort();
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    // 0006 adds an enum value; ALTER TYPE … ADD VALUE must commit before the value is used, so run it on its own.
    const enumAdd = /ALTER TYPE public\.app_role ADD VALUE IF NOT EXISTS 'staff';/;
    if (enumAdd.test(text)) await sql.unsafe("ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff'");
    await sql.begin((tx) => tx.unsafe(text.replace(enumAdd, '')));
    console.log(`applied ${f}`);
  }
}

async function user(admin: SupabaseClient, email: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const found = await admin.auth.admin.listUsers({ perPage: 1000 });
  let id = found.data?.users.find((u) => u.email === email)?.id;
  if (!id) {
    const c = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (c.error || !c.data.user) throw new Error(`create ${email}: ${c.error?.message}`);
    id = c.data.user.id;
  }
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw new Error(`sign in ${email}: ${s.error.message}`);
  return { id, email, client };
}

async function main(): Promise<number> {
  if (!SERVICE_ROLE_KEY || !ANON_KEY) { console.error('Set ANON_KEY and SERVICE_ROLE_KEY (supabase status -o env).'); return 2; }
  if (!isLocal(API_URL) || !isLocal(DB_URL)) { console.error(`Refused: ${API_URL} / DB_URL is not local. This test only runs against supabase start.`); return 2; }

  const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
  try {
    await applyMigrations(sql);
    const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const stamp = Date.now();
    const A = await user(admin, `rls-buyer-a-${stamp}@example.test`);
    const B = await user(admin, `rls-buyer-b-${stamp}@example.test`);
    const S = await user(admin, `rls-staff-${stamp}@example.test`);
    const M = await user(admin, `rls-admin-${stamp}@example.test`);
    await sql`INSERT INTO public.user_roles (user_id, role) VALUES (${S.id}, 'staff'), (${M.id}, 'admin') ON CONFLICT DO NOTHING`;

    // Fixtures (service role): one submission per buyer; A itemised (one counted line), B un-itemised.
    const sub = async (email: string, unit: string) => {
      const r = await admin.from('buyer_selections').insert({ email, first_name: 'Rls', last_name: unit, unit_number: unit }).select('id').single();
      if (r.error) throw new Error(`buyer_selections: ${r.error.message}`);
      return r.data.id as string;
    };
    const subA = await sub(A.email, `9${stamp % 1000}A`);
    const subB = await sub(B.email, `9${stamp % 1000}B`);
    const lineA = await admin.from('quote_lines').insert({
      submission_id: subA, section: 'flooring', label: 'RLS line A', status: 'upgrade', amount: 100, source: 'migration', client_visible: true,
    }).select('id').single();
    if (lineA.error) throw new Error(`quote_lines: ${lineA.error.message}`);
    const lineB = await admin.from('quote_lines').insert({
      submission_id: subB, section: 'flooring', label: 'RLS line B', status: 'upgrade', amount: 50, source: 'office', client_visible: true,
    }).select('id').single();
    if (lineB.error) throw new Error(`quote_lines: ${lineB.error.message}`);
    const revA = await A.client.from('quote_line_reviews').insert({ line_id: lineA.data.id, buyer_user_id: A.id, response: 'accepted' }).select('id').single();
    check('buyer A can review own visible line', !revA.error, revA.error?.message);

    // Buyer isolation.
    const aLines = await A.client.rpc('get_my_quote_lines');
    const aIds = ((aLines.data ?? []) as Array<{ submission_id: string }>).map((l) => l.submission_id);
    check('buyer A get_my_quote_lines returns only A', !aLines.error && aIds.length > 0 && aIds.every((s) => s === subA), aLines.error?.message ?? JSON.stringify(aIds));
    const aHeader = await A.client.rpc('get_my_quote_header');
    const hIds = ((aHeader.data ?? []) as Array<{ submission_id: string }>).map((h) => h.submission_id);
    check('buyer A get_my_quote_header returns only A', !aHeader.error && hIds.length > 0 && hIds.every((s) => s === subA), aHeader.error?.message ?? JSON.stringify(hIds));
    const bReviews = await B.client.from('quote_line_reviews').select('id');
    check("buyer B cannot read buyer A's reviews", !bReviews.error && (bReviews.data ?? []).length === 0, JSON.stringify(bReviews.data));
    const bDirect = await B.client.from('quote_lines').select('id');
    check('buyer B has no direct quote_lines read', (bDirect.data ?? []).length === 0);
    const bSel = await B.client.from('buyer_selections').select('id').eq('id', subA);
    check("buyer B cannot read buyer A's submission", (bSel.data ?? []).length === 0);
    const bForge = await B.client.from('quote_line_reviews').insert({ line_id: lineA.data.id, buyer_user_id: B.id, response: 'questioned' });
    check("buyer B cannot review buyer A's line", !!bForge.error);

    // request_quote_change: itemise-first.
    const bReq = await B.client.rpc('request_quote_change', { _text: 'Please add blinds' });
    check('request_quote_change refuses an un-itemised quote (P0002)', !!bReq.error && /not been itemised/.test(bReq.error.message), bReq.error?.message ?? 'no error');
    const aReq = await A.client.rpc('request_quote_change', { _text: 'Please add blinds' });
    check('request_quote_change works on an itemised quote', !aReq.error, aReq.error?.message);

    // Staff boundaries.
    const sPricing = await S.client.from('pricing_config').insert({ config_key: `rls_smoke_${stamp}`, config_value: 1 });
    check('staff cannot write pricing_config', !!sPricing.error);
    const sRoles = await S.client.from('user_roles').select('user_id');
    const others = ((sRoles.data ?? []) as Array<{ user_id: string }>).filter((r) => r.user_id !== S.id);
    check('staff cannot read other user_roles rows', others.length === 0, JSON.stringify(sRoles.data));
    const sRevUpd = await S.client.from('quote_line_reviews').update({ comment: 'edited by staff' }).eq('id', revA.data?.id ?? '').select('id');
    check('staff cannot edit a buyer review (0016)', !!sRevUpd.error || (sRevUpd.data ?? []).length === 0);
    const mRoles = await M.client.from('user_roles').select('user_id');
    check('admin reads user_roles', !mRoles.error && (mRoles.data ?? []).length >= 2, mRoles.error?.message);

    // Signed documents are final for staff (0016).
    const docId = crypto.randomUUID();
    const dIns = await S.client.from('documents').insert({ id: docId, submission_id: subA, kind: 'other', status: 'signed', storage_path: `9/${docId}.pdf` });
    check('staff can add a document', !dIns.error, dIns.error?.message);
    const dUpd = await S.client.from('documents').update({ status: 'draft' }).eq('id', docId).select('id');
    check('staff cannot edit a signed document', !!dUpd.error || (dUpd.data ?? []).length === 0);
    const dDel = await S.client.from('documents').delete().eq('id', docId).select('id');
    check('staff cannot delete a document', !!dDel.error || (dDel.data ?? []).length === 0);

    // updated_by stamp (0016).
    const sEdit = await S.client.from('quote_lines').update({ label: 'RLS line A (staff)' }).eq('id', lineA.data.id).select('updated_by').single();
    check('staff line edit stamps updated_by = staff', !sEdit.error && sEdit.data?.updated_by === S.id, sEdit.error?.message ?? JSON.stringify(sEdit.data));

    // counted-hidden CHECK (0010) fires even for staff.
    const hidden = await S.client.from('quote_lines').update({ client_visible: false }).eq('id', lineA.data.id);
    check('counted-hidden CHECK rejects a hidden counted line', !!hidden.error && /quote_lines_counted_visible/.test(hidden.error.message), hidden.error?.message ?? 'no error');

    // Predicates are not executable by anon (0016).
    const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    const anonPred = await anon.rpc('is_staff', { _user_id: S.id });
    check('anon cannot execute is_staff', !!anonPred.error);
  } finally {
    await sql.end();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll RLS smoke checks passed.');
  return failures ? 1 : 0;
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); });
}
