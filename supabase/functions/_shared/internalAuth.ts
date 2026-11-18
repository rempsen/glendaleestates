// Dependency-free gate for functions that must not be callable with the public anon key.
// Accepts: (a) Bearer <service role key>, (b) x-internal-secret = service role key,
// (c) a user JWT whose user has the admin role. Optionally (d) any valid user JWT
// (allowUser) for callers that then apply their own per-user rule.
import { bearerToken, type AuthedUser, type GetUser } from './authorizeSubmission.ts';

export interface HeaderSource { headers: { get(name: string): string | null } }

export type InternalAuthResult =
  | { ok: true; kind: 'service' | 'internal' | 'admin'; email?: string }
  | { ok: true; kind: 'user'; email: string }
  | { ok: false; status: 401 };

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authorizeInternalOrAdmin(
  req: HeaderSource,
  env: { serviceRoleKey: string | undefined },
  getUser: GetUser,
  opts: { allowUser?: boolean } = {},
): Promise<InternalAuthResult> {
  const key = env.serviceRoleKey;
  const jwt = bearerToken(req.headers.get('Authorization'));
  if (key) {
    if (jwt && safeEqual(jwt, key)) return { ok: true, kind: 'service' };
    const secret = req.headers.get('x-internal-secret');
    if (secret && safeEqual(secret, key)) return { ok: true, kind: 'internal' };
  }
  if (!jwt) return { ok: false, status: 401 };
  let user: AuthedUser | null = null;
  try { user = await getUser(jwt); } catch { return { ok: false, status: 401 }; }
  if (!user || !user.email) return { ok: false, status: 401 };
  if (user.isAdmin) return { ok: true, kind: 'admin', email: user.email };
  if (opts.allowUser) return { ok: true, kind: 'user', email: user.email };
  return { ok: false, status: 401 };
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
      `${supabaseUrl}/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(user.id)}&role=eq.admin&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    const roles = roleRes.ok ? await roleRes.json() : [];
    return { email: user.email, isAdmin: Array.isArray(roles) && roles.length > 0 };
  };
}
