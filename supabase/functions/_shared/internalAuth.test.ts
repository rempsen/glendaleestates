// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/internal-auth.test.ts).
import { authorizeInternalOrAdmin, isSelf } from './internalAuth.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const KEY = 'service-role-key';
  const env = { serviceRoleKey: KEY };
  const getUser = async (jwt: string) =>
    jwt === 'admin-jwt' ? { email: 'dan@bmdmaterials.com', isAdmin: true }
    : jwt === 'buyer-jwt' ? { email: 'Buyer@Example.com' } : null;
  const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n] ?? null } });

  denoTest('service bearer ok', async () => eq(await authorizeInternalOrAdmin(req({ Authorization: `Bearer ${KEY}` }), env, getUser), { ok: true, kind: 'service' }));
  denoTest('x-internal-secret ok', async () => eq(await authorizeInternalOrAdmin(req({ 'x-internal-secret': KEY }), env, getUser), { ok: true, kind: 'internal' }));
  denoTest('admin jwt ok', async () => eq(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer admin-jwt' }), env, getUser), { ok: true, kind: 'admin', email: 'dan@bmdmaterials.com' }));
  denoTest('non-admin jwt 401', async () => eq(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer buyer-jwt' }), env, getUser), { ok: false, status: 401 }));
  denoTest('anon key 401', async () => eq(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer anon' }), env, getUser), { ok: false, status: 401 }));
  denoTest('no header 401', async () => eq(await authorizeInternalOrAdmin(req({}), env, getUser), { ok: false, status: 401 }));
  denoTest('allowUser self/other', async () => {
    eq(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer buyer-jwt' }), env, getUser, { allowUser: true }), { ok: true, kind: 'user', email: 'Buyer@Example.com' });
    eq(isSelf('Buyer@Example.com', ' buyer@example.com '), true);
    eq(isSelf('Buyer@Example.com', 'x@y.co'), false);
  });
}
