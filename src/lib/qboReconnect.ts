// QuickBooks reconnect banner (Phase 2 Task 15). Pure: decides from the stored connection and the latest sync log row
// whether the admin must reconnect. Intuit refresh tokens expire (stored as qbo_connections.refresh_token_expires_at);
// once expired every sync fails in ensureFreshToken with "QBO token refresh failed" (invalid_grant). No dates are
// hard-coded here: a fresh connection (new qbo_connections row from qbo-oauth-callback) clears the banner.

export interface QboConnectionLike { refresh_token_expires_at: string | null; created_at: string }
export interface QboSyncLogLike { status: string; error_message: string | null; created_at: string }

const TOKEN_ERROR = /token refresh failed|invalid_grant|refresh token/i;

export function qboReconnectReason(
  conn: QboConnectionLike | null, lastSync: QboSyncLogLike | null, now: number = Date.now(),
): string | null {
  if (!conn) return null;
  const exp = conn.refresh_token_expires_at ? Date.parse(conn.refresh_token_expires_at) : NaN;
  if (Number.isFinite(exp) && exp <= now) {
    return `The QuickBooks authorization expired on ${new Date(exp).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
  }
  if (lastSync && lastSync.status === 'error' && TOKEN_ERROR.test(lastSync.error_message ?? '')
    && Date.parse(lastSync.created_at) > Date.parse(conn.created_at)) {
    return 'The last QuickBooks sync was refused because the authorization is no longer valid.';
  }
  return null;
}
