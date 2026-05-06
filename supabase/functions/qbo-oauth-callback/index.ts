// QuickBooks Online OAuth callback. Public endpoint (Intuit redirects the
// browser here with ?code=&state=&realmId=). Exchanges code for tokens,
// stores the single shared connection, then redirects the admin back to the
// portal Settings page with success/error.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

const APP_ORIGINS = [
  'https://glendaleestates.lovable.app',
  'https://glendale.bmdmaterials.com',
  'https://id-preview--451d344e-78b6-4641-b6ef-cc909ef041ed.lovable.app',
];

async function verifyState(state: string, secret: string): Promise<{ ok: boolean; userId?: string; returnTo?: string }> {
  const parts = state.split('.');
  if (parts.length !== 5) return { ok: false };
  const [ts, rand, userId, returnB64, sig] = parts;
  const payload = `${ts}.${rand}.${userId}.${returnB64}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const expectedBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(expectedBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (expected !== sig) return { ok: false };
  // 15 minute expiry
  if (Date.now() - parseInt(ts, 10) > 15 * 60 * 1000) return { ok: false };
  let returnTo = '';
  try { returnTo = atob(returnB64); } catch { /* noop */ }
  return { ok: true, userId, returnTo };
}

function htmlRedirect(url: string, message: string) {
  const safeUrl = url.replace(/"/g, '&quot;');
  const body = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${message}</title>
<meta http-equiv="refresh" content="0;url=${safeUrl}">
<script>window.location.replace(${JSON.stringify(url)});</script>
<style>body{font-family:system-ui;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{background:#1e293b;padding:2rem 3rem;border-radius:12px;text-align:center}</style>
</head><body><div class="card"><h2>${message}</h2><p>Redirecting back to portal…</p>
<p><a style="color:#60a5fa" href="${safeUrl}">Click here if not redirected</a></p></div></body></html>`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const realmId = url.searchParams.get('realmId');
  const error = url.searchParams.get('error');

  const clientId = Deno.env.get('QBO_CLIENT_ID')!;
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const redirectUri = `${supabaseUrl}/functions/v1/qbo-oauth-callback`;

  // Verify & extract returnTo before deciding redirect target
  const stateResult = await verifyState(state, clientSecret);
  const fallbackOrigin = APP_ORIGINS[0];
  const returnTo = stateResult.returnTo && APP_ORIGINS.some((o) => stateResult.returnTo!.startsWith(o))
    ? stateResult.returnTo
    : `${fallbackOrigin}/admin/settings/quickbooks`;

  if (error) {
    return htmlRedirect(`${returnTo}?qbo=error&reason=${encodeURIComponent(error)}`, 'QuickBooks connection cancelled');
  }
  if (!stateResult.ok) {
    return htmlRedirect(`${returnTo}?qbo=error&reason=invalid_state`, 'Invalid OAuth state');
  }
  if (!code || !realmId) {
    return htmlRedirect(`${returnTo}?qbo=error&reason=missing_code_or_realm`, 'Missing code or realm');
  }

  try {
    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('QBO token exchange failed', tokenJson);
      return htmlRedirect(
        `${returnTo}?qbo=error&reason=${encodeURIComponent('token_exchange_' + tokenRes.status)}`,
        'QuickBooks token exchange failed'
      );
    }

    const accessExpiresAt = new Date(Date.now() + (tokenJson.expires_in * 1000)).toISOString();
    const refreshExpiresAt = new Date(Date.now() + (tokenJson.x_refresh_token_expires_in * 1000)).toISOString();

    const admin = createClient(supabaseUrl, serviceKey);

    // Look up admin email
    let connectedEmail: string | null = null;
    if (stateResult.userId) {
      const { data: userRow } = await admin.auth.admin.getUserById(stateResult.userId);
      connectedEmail = userRow?.user?.email ?? null;
    }

    // Deactivate existing active connection then insert new one
    await admin.from('qbo_connections').update({ is_active: false }).eq('is_active', true);

    const { error: insErr } = await admin.from('qbo_connections').insert({
      realm_id: realmId,
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      access_token_expires_at: accessExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      environment: 'production',
      connected_by_user_id: stateResult.userId,
      connected_by_email: connectedEmail,
      is_active: true,
    });

    if (insErr) {
      console.error('Failed to store connection', insErr);
      return htmlRedirect(
        `${returnTo}?qbo=error&reason=${encodeURIComponent('store_failed')}`,
        'Failed to save connection'
      );
    }

    await admin.from('qbo_sync_log').insert({
      direction: 'outbound',
      operation: 'oauth_connect',
      status: 'success',
      triggered_by_user_id: stateResult.userId,
      triggered_by_email: connectedEmail,
      response_payload: { realm_id: realmId, expires_in: tokenJson.expires_in },
    });

    return htmlRedirect(`${returnTo}?qbo=connected&realm=${realmId}`, 'QuickBooks connected!');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('QBO callback error', msg);
    return htmlRedirect(
      `${returnTo}?qbo=error&reason=${encodeURIComponent(msg.slice(0, 80))}`,
      'QuickBooks connection failed'
    );
  }
});
