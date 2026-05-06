// Shared QuickBooks Online client helpers.
// Handles token refresh, base URL selection, and authenticated requests.

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export interface QboConnection {
  id: string;
  realm_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string | null;
  environment: string;
  is_active: boolean;
}

export function qboBaseUrl(environment: string): string {
  return environment === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

interface SupabaseAdmin {
  from: (table: string) => {
    update: (vals: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{ error: unknown }>;
    };
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

export async function getActiveConnection(admin: {
  from: (t: string) => any;
}): Promise<QboConnection> {
  const { data, error } = await admin
    .from('qbo_connections')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error('Failed to load QBO connection: ' + (error as Error).message);
  if (!data) throw new Error('QuickBooks is not connected. Connect via Admin → QuickBooks first.');
  return data as QboConnection;
}

/** Refresh the access token if it expires within the next 5 minutes. */
export async function ensureFreshToken(
  admin: { from: (t: string) => any },
  conn: QboConnection,
): Promise<QboConnection> {
  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  const skewMs = 5 * 60 * 1000;
  if (expiresAt - skewMs > Date.now()) return conn;

  const clientId = Deno.env.get('QBO_CLIENT_ID')!;
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET')!;
  const basic = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error('QBO token refresh failed: ' + JSON.stringify(json));
  }

  const newAccess = json.access_token as string;
  const newRefresh = (json.refresh_token as string) || conn.refresh_token;
  const accessExpiresAt = new Date(Date.now() + (json.expires_in * 1000)).toISOString();
  const refreshExpiresAt = new Date(
    Date.now() + ((json.x_refresh_token_expires_in ?? 8640000) * 1000),
  ).toISOString();

  await admin.from('qbo_connections').update({
    access_token: newAccess,
    refresh_token: newRefresh,
    access_token_expires_at: accessExpiresAt,
    refresh_token_expires_at: refreshExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id);

  return {
    ...conn,
    access_token: newAccess,
    refresh_token: newRefresh,
    access_token_expires_at: accessExpiresAt,
    refresh_token_expires_at: refreshExpiresAt,
  };
}

/** Make an authenticated QBO API call. Returns the parsed JSON body. */
export async function qboFetch(
  conn: QboConnection,
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Promise<any> {
  const url = new URL(`${qboBaseUrl(conn.environment)}/v3/company/${conn.realm_id}${path}`);
  url.searchParams.set('minorversion', '73');
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v);
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${conn.access_token}`);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url.toString(), { ...init, headers });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const fault = json?.Fault?.Error?.[0];
    const msg = fault
      ? `QBO ${res.status}: ${fault.Message} — ${fault.Detail || ''}`
      : `QBO ${res.status}: ${text.slice(0, 300)}`;
    const err = new Error(msg) as Error & { status?: number; payload?: unknown };
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

/** Run a QBO SQL-like query. Returns the QueryResponse object. */
export async function qboQuery(conn: QboConnection, sql: string): Promise<any> {
  const json = await qboFetch(conn, '/query', { query: { query: sql } });
  return json?.QueryResponse ?? {};
}
