// notify-pricing-request (Phase 2 Task 12, spec §6.6): a quote line was flagged to a pricer → Teams Adaptive Card,
// Resend email to the assignee when Teams is unset or the POST fails. Logic: ./handler.ts (tested).
//
// TRIGGER — a Supabase Database Webhook, configured in the dashboard (not a pg_net trigger in a migration):
//   Database → Webhooks → Create a new hook
//     Name:               notify_pricing_request
//     Table:              public.quote_lines
//     Events:             Insert, Update        (not Delete)
//     Type:               Supabase Edge Functions
//     Edge Function:      notify-pricing-request   Method: POST   Timeout: 5000 ms
//     HTTP Headers:       Content-Type: application/json
//                         Authorization: Bearer <service role key>   ("Add auth header with service key")
//   Payload is Supabase's { type, table, schema, record, old_record }. The function acts only when
//   record.flagged_to is set and differs from old_record.flagged_to; every other autosave returns 200 "skipped".
//
// IDEMPOTENCY — one notification per flagging: the key line:assignee:flagged_at (flagged_at is stamped by the
// quote_lines_flag_stamp trigger, migration 0011) is claimed by inserting a submission_audit_logs row with
// action_type 'pricing_request_notified'; a unique index on changes->>'dedupe_key' makes a re-delivery a no-op.
//
// SETTINGS (portal_settings, admin-edited at /admin/settings/notifications): teams_webhook_url.
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, optional PORTAL_BASE_URL.
// TEST: POST { "test": true } with an admin JWT (the settings page button) → { ok, channel, error? }.
import { getCorsHeaders } from '../_shared/cors.ts';
import { authorizeInternalOrAdmin, makeGetUserFromJwt } from '../_shared/internalAuth.ts';
import { personName } from '../_shared/pricingQueue.ts';
import {
  DEFAULT_PORTAL_BASE, loadPricingSettings, postTeams, restClient, sendResendEmail,
} from '../_shared/notifyTransport.ts';
import { handleNotify, type LineContext } from './handler.ts';

type LineRest = {
  id: string; submission_id: string; flagged_to: string | null; flagged_at: string | null; status: string;
  location: string | null; label: string; product_name: string | null; product_colour: string | null; internal_note: string | null;
  buyer: { unit_number: string | null; first_name: string | null; last_name: string | null } | null;
  assignee: { email: string | null; first_name: string | null; last_name: string | null } | null;
};

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: 'Function not configured' });

  const auth = await authorizeInternalOrAdmin(req, { serviceRoleKey: serviceKey }, makeGetUserFromJwt(supabaseUrl, serviceKey));
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }

  const rest = restClient(supabaseUrl, serviceKey);
  const resendKey = Deno.env.get('RESEND_API_KEY');
  try {
    const r = await handleNotify(body, auth, {
      portalBase: Deno.env.get('PORTAL_BASE_URL') || DEFAULT_PORTAL_BASE,
      getTeamsUrl: async () => (await loadPricingSettings(rest)).teamsUrl,
      async loadLine(lineId): Promise<LineContext | null> {
        const select = 'id,submission_id,flagged_to,flagged_at,status,location,label,product_name,product_colour,internal_note,'
          + 'buyer:buyer_selections(unit_number,first_name,last_name),'
          + 'assignee:profiles!quote_lines_flagged_to_fkey(email,first_name,last_name)';
        const rows = await rest.get<LineRest[]>(`quote_lines?select=${select}&id=eq.${encodeURIComponent(lineId)}&limit=1`);
        const l = rows[0];
        if (!l) return null;
        return {
          lineId: l.id, submissionId: l.submission_id, flaggedTo: l.flagged_to, flaggedAt: l.flagged_at, status: l.status,
          unit: l.buyer?.unit_number ?? '—', buyerName: personName(l.buyer?.first_name, l.buyer?.last_name),
          location: l.location ?? '', label: l.label, product: l.product_name, colour: l.product_colour,
          internalNote: l.internal_note,
          assigneeName: personName(l.assignee?.first_name, l.assignee?.last_name) || l.assignee?.email || 'Pricing owner',
          assigneeEmail: l.assignee?.email ?? null,
        };
      },
      async claim(key, info) {
        const res = await rest.post('submission_audit_logs', {
          submission_id: info.submissionId,
          action_type: 'pricing_request_notified',
          change_summary: 'Pricing request notification',
          changes: { dedupe_key: key, line_id: info.lineId, flagged_to: info.flaggedTo, flagged_at: info.flaggedAt },
        });
        if (res.ok) return true;
        const text = await res.text();
        if (res.status === 409 || text.includes('23505')) return false; // unique dedupe_key: already sent
        throw new Error(`claim: HTTP ${res.status} ${text}`);
      },
      postTeams,
      sendEmail: (m) => sendResendEmail(resendKey, m),
    });
    return json(r.status, r.body);
  } catch (e) {
    console.error('notify-pricing-request failed', e);
    return json(500, { ok: false, channel: 'none', error: e instanceof Error ? e.message : String(e) });
  }
});
