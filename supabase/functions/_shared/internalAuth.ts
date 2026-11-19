// Dependency-free gate for functions that must not be callable with the public anon key.
// Accepts: (a) Bearer <service role key>, (b) x-internal-secret = service role key,
// (c) a user JWT whose user has the admin role. Optionally (d) any valid user JWT
// (allowUser) for callers that then apply their own per-user rule.
// authorizeStaffOrAdmin (Phase 2 Task 16): the same service/internal paths, plus an admin or staff JWT; a valid
// non-staff (buyer) JWT gets 403, no / invalid JWT 401. Used by the staff-facing functions (spec §6.9).
import { bearerToken, type AuthedUser, type GetUser } from './authorizeSubmission.ts';

export interface HeaderSource { headers: { get(name: string): string | null } }

export type InternalAuthResult =
  | { ok: true; kind: 'service' | 'internal' | 'admin'; email?: string; userId?: string }
  | { ok: true; kind: 'staff' | 'user'; email: string; userId?: string }
  | { ok: false; status: 401 | 403 };

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Resolved =
  | { done: InternalAuthResult }
  | { done?: undefined; user: AuthedUser & { email: string }; id: { userId?: string } };

async function resolveCaller(req: HeaderSource, env: { serviceRoleKey: string | undefined }, getUser: GetUser): Promise<Resolved> {
  const key = env.serviceRoleKey;
  const jwt = bearerToken(req.headers.get('Authorization'));
  if (key) {
    if (jwt && safeEqual(jwt, key)) return { done: { ok: true, kind: 'service' } };
    const secret = req.headers.get('x-internal-secret');
    if (secret && safeEqual(secret, key)) return { done: { ok: true, kind: 'internal' } };
  }
  if (!jwt) return { done: { ok: false, status: 401 } };
  let user: AuthedUser | null = null;
  try { user = await getUser(jwt); } catch { return { done: { ok: false, status: 401 } }; }
  if (!user || !user.email) return { done: { ok: false, status: 401 } };
  return { user: user as AuthedUser & { email: string }, id: user.id ? { userId: user.id } : {} };
}

export async function authorizeInternalOrAdmin(
  req: HeaderSource,
  env: { serviceRoleKey: string | undefined },
  getUser: GetUser,
  opts: { allowUser?: boolean } = {},
): Promise<InternalAuthResult> {
  const r = await resolveCaller(req, env, getUser);
  if (r.done) return r.done;
  const { user, id } = r;
  if (user.isAdmin) return { ok: true, kind: 'admin', email: user.email, ...id };
  if (opts.allowUser) return { ok: true, kind: 'user', email: user.email, ...id };
  return { ok: false, status: 401 };
}

/** Service key / x-internal-secret, or an admin or staff JWT. Signed-in non-staff → 403; no / bad JWT → 401. */
export async function authorizeStaffOrAdmin(
  req: HeaderSource,
  env: { serviceRoleKey: string | undefined },
  getUser: GetUser,
): Promise<InternalAuthResult> {
  const r = await resolveCaller(req, env, getUser);
  if (r.done) return r.done;
  const { user, id } = r;
  if (user.isAdmin) return { ok: true, kind: 'admin', email: user.email, ...id };
  if (user.isStaff) return { ok: true, kind: 'staff', email: user.email, ...id };
  return { ok: false, status: 403 };
}

/** True when `recipient` is the authenticated user's own address (case-insensitive, trimmed). */
export function isSelf(userEmail: string, recipient: unknown): boolean {
  return typeof recipient === 'string' && recipient.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

/** GoTrue + user_roles lookup used by every gated function. Anon key resolves to null. */
export function makeGetUserFromJwt(supabaseUrl: string, serviceKey: string): GetUser {
  return async (jwt: string) => {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${jwt}` },
    });
    if (!userRes.ok) return null;
    const user = await userRes.json();
    if (!user?.id || typeof user.email !== 'string' || !user.email) return null;
    const roleRes = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(user.id)}&role=in.(admin,staff)`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const roles: Array<{ role?: string }> = roleRes.ok ? await roleRes.json() : [];
    const has = (r: string) => Array.isArray(roles) && roles.some((x) => x?.role === r);
    const isAdmin = has('admin');
    return { email: user.email, id: String(user.id), isAdmin, isStaff: isAdmin || has('staff') };
  };
}
