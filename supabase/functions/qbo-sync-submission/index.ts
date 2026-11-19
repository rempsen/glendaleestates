// deno-lint-ignore-file no-explicit-any -- QBO JSON responses are untyped
/* eslint-disable @typescript-eslint/no-explicit-any -- QBO JSON responses are untyped */
// Pushes a buyer_selections submission into QuickBooks Online as:
//   Customer (buyer)  →  Sub-customer/Project (unit)  →  Estimate (one line per counted quote_line)
// Phase 2 Task 15: the estimate is built 1:1 from quote_lines (stored, else generated) by _shared/qboLinesMap.ts;
// no pricing engine call. Logic (refusals, Item lookup/create, estimate body): ./handler.ts (tested).
// Idempotent via qbo_entity_map.
//
// Caller: admin-only (UI button) OR self-invoked from auto-sync trigger.
// Self-invocations include header `x-internal-secret = SUPABASE_SERVICE_ROLE_KEY`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ensureFreshToken, getActiveConnection, qboFetch, qboQuery } from '../_shared/qboClient.ts';
import { clientPricingFetcher, loadServerPricing, pricingUnavailableReason } from '../_shared/loadServerPricing.ts';
import { loadSubmissionLinesClient } from '../_shared/savedSubmissionLines.ts';
import { handleQboSync, type SyncDeps, type TriggeredBy } from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

function makeDeps(admin: any): SyncDeps {
  return {
    async loadSubmission(id) {
      const { data, error } = await admin.from('buyer_selections').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`Submission load failed: ${error.message}`);
      return data ?? null;
    },
    async loadSettings() {
      const { data } = await admin.from('qbo_settings').select('*').limit(1).maybeSingle();
      return data ?? null;
    },
    async loadLines(submission) {
      const pricing = await loadServerPricing(clientPricingFetcher(admin));
      const { lines, linesSource } = await loadSubmissionLinesClient(admin, submission.id, submission, pricing);
      return { lines, linesSource, gstRate: pricing.gstRate, pricingUnavailable: pricingUnavailableReason(pricing) };
    },
    async qbo() {
      const conn = await ensureFreshToken(admin, await getActiveConnection(admin));
      return {
        query: (sql) => qboQuery(conn, sql),
        post: (path, body) => qboFetch(conn, path, { method: 'POST', body: JSON.stringify(body) }),
      };
    },
    async getMap(entity_type, portal_ref_type, portal_ref_id) {
      const { data, error } = await admin.from('qbo_entity_map').select('qbo_id, qbo_sync_token')
        .eq('entity_type', entity_type).eq('portal_ref_type', portal_ref_type).eq('portal_ref_id', portal_ref_id).maybeSingle();
      if (error) throw new Error(`qbo_entity_map read failed (${entity_type}/${portal_ref_type}): ${error.message}`);
      return data ?? null;
    },
    async setMap(entity_type, portal_ref_type, portal_ref_id, qbo_id, qbo_sync_token, metadata = {}) {
      const { error } = await admin.from('qbo_entity_map').upsert({
        entity_type, portal_ref_type, portal_ref_id, qbo_id, qbo_sync_token, metadata, last_synced_at: new Date().toISOString(),
      }, { onConflict: 'entity_type,portal_ref_type,portal_ref_id' });
      if (error) throw new Error(`qbo_entity_map write failed (${entity_type}/${portal_ref_type}): ${error.message}`);
    },
    async log(row) {
      try { await admin.from('qbo_sync_log').insert(row); } catch (e) { console.warn('log fail', e); }
    },
  };
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let triggeredBy: TriggeredBy = { user_id: null, email: null, source: 'manual' };

  try {
    // Allow internal calls from the DB trigger (service-role secret) OR admin user JWT.
    const internalSecret = req.headers.get('x-internal-secret');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (internalSecret && internalSecret === serviceKey) {
      triggeredBy = { user_id: null, email: 'system@auto-sync', source: 'auto' };
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: ud } = await supabase.auth.getUser();
      if (!ud?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roleRow } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', ud.user.id).eq('role', 'admin').maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      triggeredBy = { user_id: ud.user.id, email: ud.user.email ?? null, source: 'manual' };
    }

    const body = await req.json().catch(() => ({}));
    const r = await handleQboSync(body, triggeredBy, makeDeps(admin));
    return new Response(JSON.stringify(r.body), {
      status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('qbo-sync-submission error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
