// esign-webhook (Phase 2 Task 14, spec §6.8): public SignWell webhook (verify_jwt = false). Logic: ./handler.ts (tested).
// The signature is verified on the raw body before anything is parsed or read from the database.
// Register the webhook URL https://<project-ref>.supabase.co/functions/v1/esign-webhook with SignWell
// (POST /api/v1/hooks or the dashboard). SIGNWELL_WEBHOOK_SECRET is the Webhook ID that POST /api/v1/hooks returns
// (also shown in the dashboard's webhook list); SignWell keys each event hash with it.
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_SECRET.
// SETTINGS: portal_settings.esign_status_after_signed (default "completed"; JSON null = leave the status alone).
import { ESIGN_SETTINGS_KEYS } from '../_shared/esign/documents.ts';
import { providerFromEnv } from '../_shared/esign/providerFromEnv.ts';
import { serviceRest } from '../_shared/esign/serviceRest.ts';
import { handleEsignWebhook } from './handler.ts';

type DocRest = {
  id: string; submission_id: string; status: string; kind: string;
  buyer: { unit_number: string | null; status: string | null; reviewed_at: string | null; quoted_at: string | null; completed_at: string | null } | null;
};

Deno.serve(async (req) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const provider = providerFromEnv('signwell', (k) => Deno.env.get(k));
  if (!supabaseUrl || !serviceKey || !provider) return json(500, { ok: false, error: 'Function not configured' });

  const raw = await req.text();
  const rest = serviceRest(supabaseUrl, serviceKey);
  try {
    const r = await handleEsignWebhook(raw, req.headers, {
      provider,
      async findDocument(providerName, providerDocumentId) {
        const select = 'id,submission_id,status,kind,buyer:buyer_selections(unit_number,status,reviewed_at,quoted_at,completed_at)';
        const rows = await rest.get<DocRest[]>(
          `documents?select=${select}&provider=eq.${encodeURIComponent(providerName)}&provider_envelope_id=eq.${encodeURIComponent(providerDocumentId)}&limit=1`,
        );
        const d = rows[0];
        if (!d) return null;
        return {
          id: d.id, submissionId: d.submission_id, status: d.status, kind: d.kind, unitNumber: d.buyer?.unit_number ?? null,
          submission: {
            status: d.buyer?.status ?? null, reviewed_at: d.buyer?.reviewed_at ?? null,
            quoted_at: d.buyer?.quoted_at ?? null, completed_at: d.buyer?.completed_at ?? null,
          },
        };
      },
      uploadPdf: (path, bytes) => rest.uploadPdf(path, bytes),
      async updateDocument(id, fromStatuses, patch) {
        return (await rest.patch(`documents?id=eq.${encodeURIComponent(id)}&status=in.(${fromStatuses.join(',')})`, patch)) > 0;
      },
      async statusAfterSignedSetting() {
        const rows = await rest.get<Array<{ value: unknown }>>(`portal_settings?select=value&key=eq.${ESIGN_SETTINGS_KEYS.statusAfterSigned}&limit=1`);
        return rows.length ? rows[0].value : undefined;
      },
      async updateSubmission(id, patch) { await rest.patch(`buyer_selections?id=eq.${encodeURIComponent(id)}`, patch); },
      audit: (row) => rest.post('submission_audit_logs', row),
      now: () => new Date().toISOString(),
    });
    return json(r.status, r.body);
  } catch (e) {
    // 500 → SignWell retries; the handler is idempotent on redelivery.
    console.error('esign-webhook failed', e);
    return json(500, { ok: false, error: 'Processing failed' });
  }
});
