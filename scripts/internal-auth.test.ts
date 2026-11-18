import { test, expect } from 'bun:test';
import { authorizeInternalOrAdmin, isSelf } from '../supabase/functions/_shared/internalAuth';

const KEY = 'service-role-key';
const env = { serviceRoleKey: KEY };
const getUser = async (jwt: string) =>
  jwt === 'admin-jwt' ? { email: 'dan@bmdmaterials.com', isAdmin: true }
  : jwt === 'buyer-jwt' ? { email: 'Buyer@Example.com' } : null;
const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n] ?? h[n.toLowerCase()] ?? null } });

test('service-role Bearer ok', async () => {
  expect(await authorizeInternalOrAdmin(req({ Authorization: `Bearer ${KEY}` }), env, getUser)).toEqual({ ok: true, kind: 'service' });
});
test('x-internal-secret ok', async () => {
  expect(await authorizeInternalOrAdmin(req({ 'x-internal-secret': KEY }), env, getUser)).toEqual({ ok: true, kind: 'internal' });
});
test('wrong x-internal-secret -> 401', async () => {
  expect(await authorizeInternalOrAdmin(req({ 'x-internal-secret': 'nope' }), env, getUser)).toEqual({ ok: false, status: 401 });
});
test('admin JWT ok', async () => {
  expect(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer admin-jwt' }), env, getUser)).toEqual({ ok: true, kind: 'admin', email: 'dan@bmdmaterials.com' });
});
test('non-admin JWT -> 401', async () => {
  expect(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer buyer-jwt' }), env, getUser)).toEqual({ ok: false, status: 401 });
});
test('anon key -> 401', async () => {
  expect(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer anon-key' }), env, getUser)).toEqual({ ok: false, status: 401 });
});
test('no header -> 401', async () => {
  expect(await authorizeInternalOrAdmin(req({}), env, getUser)).toEqual({ ok: false, status: 401 });
});
test('missing service key env never matches an empty secret', async () => {
  expect(await authorizeInternalOrAdmin(req({ 'x-internal-secret': '' }), { serviceRoleKey: undefined }, getUser)).toEqual({ ok: false, status: 401 });
});
test('allowUser: non-admin JWT returns kind user; self-email vs other-email', async () => {
  const r = await authorizeInternalOrAdmin(req({ Authorization: 'Bearer buyer-jwt' }), env, getUser, { allowUser: true });
  expect(r).toEqual({ ok: true, kind: 'user', email: 'Buyer@Example.com' });
  expect(isSelf('Buyer@Example.com', ' buyer@example.COM ')).toBe(true);
  expect(isSelf('Buyer@Example.com', 'other@example.com')).toBe(false);
  expect(isSelf('Buyer@Example.com', undefined)).toBe(false);
});
test('allowUser still rejects anon key', async () => {
  expect(await authorizeInternalOrAdmin(req({ Authorization: 'Bearer anon-key' }), env, getUser, { allowUser: true })).toEqual({ ok: false, status: 401 });
});
// Final-review MINOR: send-draft-reminder compares x-internal-secret with the exported constant-time safeEqual.
import { safeEqual } from '../supabase/functions/_shared/internalAuth';
test('safeEqual: equal, different, different length', () => {
  expect(safeEqual('service-role-key', 'service-role-key')).toBe(true);
  expect(safeEqual('service-role-key', 'service-role-kez')).toBe(false);
  expect(safeEqual('short', 'service-role-key')).toBe(false);
});
