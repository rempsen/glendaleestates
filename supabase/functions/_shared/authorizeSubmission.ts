// Pure, dependency-free auth guards for the submission edge function.
// Kept free of Deno/remote imports so it is unit-testable under both deno and bun.

export interface AuthedUser {
  email: string;
  /** True when the user holds the `admin` role (public.user_roles). */
  isAdmin?: boolean;
  /** True when the user holds the `staff` role (public.is_staff: admin or staff). */
  isStaff?: boolean;
  /** auth.users id, when the resolver knows it (audit rows). */
  id?: string;
}

export type GetUser = (jwt: string) => Promise<AuthedUser | null>;

export type AuthorizeResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 };

/** Extract the token from an `Authorization: Bearer <jwt>` header, or null. */
export function bearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

async function resolveUser(authHeader: string | null, getUser: GetUser): Promise<AuthedUser | null> {
  const jwt = bearerToken(authHeader);
  if (!jwt) return null;
  let user: AuthedUser | null = null;
  try {
    user = await getUser(jwt);
  } catch {
    return null;
  }
  if (!user || typeof user.email !== 'string' || user.email === '') return null;
  return user;
}

/**
 * Submission guard.
 *  - 401: no / malformed / invalid JWT (including the anon key, which has no user).
 *  - 403: authenticated, but the body email differs from the JWT email and the caller is not an admin.
 *  - ok:  JWT email matches the body email (case-insensitive), or the caller is an admin
 *         (admins may submit on behalf of a buyer).
 */
export async function authorizeSubmission(
  authHeader: string | null,
  bodyEmail: string,
  getUser: GetUser,
): Promise<AuthorizeResult> {
  const user = await resolveUser(authHeader, getUser);
  if (!user) return { ok: false, status: 401 };
  const same = typeof bodyEmail === 'string' && user.email.toLowerCase() === bodyEmail.trim().toLowerCase();
  if (!same && !user.isAdmin) return { ok: false, status: 403 };
  return { ok: true, email: user.email };
}

/** Admin-only guard (preview / test actions): 401 without a valid JWT, 403 for non-admins. */
export async function authorizeAdmin(
  authHeader: string | null,
  getUser: GetUser,
): Promise<AuthorizeResult> {
  const user = await resolveUser(authHeader, getUser);
  if (!user) return { ok: false, status: 401 };
  if (!user.isAdmin) return { ok: false, status: 403 };
  return { ok: true, email: user.email };
}

export const SEED_NOTIFICATION_RECIPIENTS: readonly string[] = [
  'dan@bmdmaterials.com',
  'noni@bmdmaterials.com',
  'brian@bmdmaterials.com',
  'office@bmdmaterials.com',
  'gregor.mckenzie@nvc360.com',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse the `internal_notification_recipients` settings value.
 * Returns the cleaned list, or null when the value is missing/malformed/empty
 * (caller falls back to the seed list and logs a warning).
 */
export function parseRecipients(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') return null;
    const e = v.trim();
    if (!EMAIL_RE.test(e)) return null;
    if (!out.some(x => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out.length > 0 ? out : null;
}
