// Service-role REST + Teams + Resend I/O for notify-pricing-request and pricing-digest (Task 12).
// Plain fetch (no supabase-js) so both functions type-check offline. Secrets come from env only.
import { parseDigestRecipients, parseEscalationHours, parseTeamsWebhookUrl, SETTINGS_KEYS } from './pricingQueue.ts';

/** Same sender as the other BMD notification emails (send-selections-email, resend-corrected-summary). */
export const PRICING_EMAIL_FROM = 'BMD Materials Portal <selections@bmdmaterials.com>';
export const DEFAULT_PORTAL_BASE = 'https://glendaleestates.lovable.app';

export type SendResult = { ok: true } | { ok: false; error: string };

export interface Rest {
  get<T = unknown>(path: string): Promise<T>;
  post(path: string, body: unknown, prefer?: string): Promise<Response>;
}

export function restClient(supabaseUrl: string, serviceKey: string): Rest {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  return {
    async get<T>(path: string): Promise<T> {
      const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
      if (!r.ok) throw new Error(`GET ${path.split('?')[0]}: HTTP ${r.status} ${await r.text()}`);
      return await r.json() as T;
    },
    post(path: string, body: unknown, prefer = 'return=minimal'): Promise<Response> {
      return fetch(`${supabaseUrl}/rest/v1/${path}`, { method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(body) });
    },
  };
}

export interface PricingSettings { teamsUrl: string | null; escalationHours: number; recipients: string[] }

export async function loadPricingSettings(rest: Rest): Promise<PricingSettings> {
  const keys = Object.values(SETTINGS_KEYS).join(',');
  const rows = await rest.get<Array<{ key: string; value: unknown }>>(`portal_settings?select=key,value&key=in.(${keys})`);
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return {
    teamsUrl: parseTeamsWebhookUrl(get(SETTINGS_KEYS.teamsWebhookUrl)),
    escalationHours: parseEscalationHours(get(SETTINGS_KEYS.escalationHours)),
    recipients: parseDigestRecipients(get(SETTINGS_KEYS.digestRecipients)),
  };
}

export async function postTeams(url: string, body: unknown): Promise<SendResult> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return { ok: true };
    return { ok: false, error: `Teams HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: `Teams: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function sendResendEmail(
  apiKey: string | undefined,
  msg: { to: string[]; subject: string; html: string; text: string },
): Promise<SendResult> {
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: PRICING_EMAIL_FROM, ...msg }),
    });
    if (r.ok) return { ok: true };
    const j = await r.json().catch(() => ({})) as { message?: string };
    return { ok: false, error: j.message ?? `Resend HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: `Resend: ${e instanceof Error ? e.message : String(e)}` };
  }
}
