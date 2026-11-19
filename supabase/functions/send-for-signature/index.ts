// send-for-signature (Phase 2 Task 14, spec §6.8): staff JWT → provider document from the snapshot PDF the console
// uploaded to unit-documents/{unit}/{document_id}.pdf → { embedded_signing_url }. Logic: ./handler.ts (tested).
// verify_jwt = false in config.toml; gated in-function by authorizeInternalOrAdmin({ allowStaff }) (admin or staff JWT).
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_SECRET, SIGNWELL_TEST_MODE (default true).
// SETTINGS: portal_settings.esign_provider (default "signwell").
import { getCorsHeaders } from '../_shared/cors.ts';
import { authorizeInternalOrAdmin, makeGetUserFromJwt } from '../_shared/internalAuth.ts';
import { ESIGN_SETTINGS_KEYS, parseEsignProvider } from '../_shared/esign/documents.ts';
import { providerFromEnv } from '../_shared/esign/providerFromEnv.ts';
import { serviceRest } from '../_shared/esign/serviceRest.ts';
import { handleSendForSignature } from './handler.ts';

type DocRest = {
  id: string; submission_id: string; kind: string; status: string; storage_path: string | null; snapshot_id: string | null;
  buyer: { unit_number: string | null; first_name: string | null; last_name: string | null; email: string | null } | null;
};

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Function not configured' });

  const auth = await authorizeInternalOrAdmin(req, { serviceRoleKey: serviceKey }, makeGetUserFromJwt(supabaseUrl, serviceKey), { allowStaff: true });
  let body: unknown = null;
  try { body = await req.json(); } catch { body = null; }

  const rest = serviceRest(supabaseUrl, serviceKey);
  try {
    const r = await handleSendForSignature(body, auth, {
      async loadDocument(id) {
        const select = 'id,submission_id,kind,status,storage_path,snapshot_id,buyer:buyer_selections(unit_number,first_name,last_name,email)';
        const rows = await rest.get<DocRest[]>(`documents?select=${select}&id=eq.${encodeURIComponent(id)}&limit=1`);
        const d = rows[0];
        if (!d) return null;
        return {
          id: d.id, submissionId: d.submission_id, kind: d.kind, status: d.status, storagePath: d.storage_path, snapshotId: d.snapshot_id,
          unitNumber: d.buyer?.unit_number ?? null,
          buyerName: [d.buyer?.first_name, d.buyer?.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' '),
          buyerEmail: d.buyer?.email ?? null,
        };
      },
      async providerName() {
        const rows = await rest.get<Array<{ value: unknown }>>(`portal_settings?select=value&key=eq.${ESIGN_SETTINGS_KEYS.provider}&limit=1`);
        return parseEsignProvider(rows[0]?.value);
      },
      provider: (name) => providerFromEnv(name, (k) => Deno.env.get(k)),
      signedUrl: (path, seconds) => rest.signedUrl(path, seconds),
      async markSent(id, patch) {
        return (await rest.patch(`documents?id=eq.${encodeURIComponent(id)}&status=eq.draft`, patch)) > 0;
      },
      audit: (row) => rest.post('submission_audit_logs', row),
    });
    return json(r.status, r.body);
  } catch (e) {
    console.error('send-for-signature failed', e);
    return json(502, { error: e instanceof Error ? e.message : String(e) });
  }
});
