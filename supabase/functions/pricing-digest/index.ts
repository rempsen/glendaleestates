// pricing-digest (Phase 2 Task 12, spec §6.6): daily 08:00 CT digest of open pricing requests.
//  1. Each assignee is emailed their lines older than portal_settings.pricing_escalation_hours (escalation).
//  2. pricing_digest_recipients get the summary grouped by assignee, plus "Buyer responses since yesterday" (latest
//     quote_line_reviews row per line, comments included — staff channel), also posted to Teams when set.
// Called by .github/workflows/pricing-digest.yml. Gate: header x-internal-secret must equal env INTERNAL_SECRET.
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, INTERNAL_SECRET, optional PORTAL_BASE_URL.
// Logic: ./handler.ts (tested in scripts/pricing-notify.test.ts).
import { corsHeaders } from '../_shared/cors.ts';
import { OPEN_QUEUE_REST_FILTER, queueRowsFromRest, REVIEWS_REST_SELECT, reviewRowsFromRest } from '../_shared/pricingQueue.ts';
import {
  DEFAULT_PORTAL_BASE, loadPricingSettings, postTeams, restClient, sendResendEmail,
} from '../_shared/notifyTransport.ts';
import { digestAuthorized, handleDigest } from './handler.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });
  if (!digestAuthorized(req, Deno.env.get('INTERNAL_SECRET'))) return json(401, { ok: false, error: 'Unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: 'Function not configured' });
  const rest = restClient(supabaseUrl, serviceKey);
  const resendKey = Deno.env.get('RESEND_API_KEY');

  try {
    const r = await handleDigest({
      portalBase: Deno.env.get('PORTAL_BASE_URL') || DEFAULT_PORTAL_BASE,
      now: () => new Date(),
      loadSettings: () => loadPricingSettings(rest),
      async loadOpen() {
        // Not the pricing_queue view: it filters on is_staff(auth.uid()), which is null for the service role. Same
        // predicate as the view (0012): flagged lines plus unassigned buyer requests ("Unassigned" in the summary).
        const select = 'id,submission_id,section,location,label,internal_note,flagged_to,flagged_at,'
          + 'buyer:buyer_selections(unit_number,first_name,last_name),'
          + 'assignee:profiles!quote_lines_flagged_to_fkey(email,first_name,last_name)';
        const rows = await rest.get<Array<Record<string, unknown>>>(
          `quote_lines?select=${select}&${OPEN_QUEUE_REST_FILTER}&order=flagged_at.asc&limit=1000`,
        );
        return queueRowsFromRest(rows);
      },
      async loadReviews(since) {
        const rows = await rest.get<Array<Record<string, unknown>>>(
          `quote_line_reviews?select=${REVIEWS_REST_SELECT}&created_at=gte.${encodeURIComponent(since.toISOString())}`
          + '&order=created_at.desc&limit=1000',
        );
        return reviewRowsFromRest(rows);
      },
      sendEmail: (m) => sendResendEmail(resendKey, m),
      postTeams,
    });
    return json(r.status, r.body);
  } catch (e) {
    console.error('pricing-digest failed', e);
    return json(500, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
