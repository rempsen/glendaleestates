// Admin-only: AI summary of a buyer's upgrade requests, quote lines, buyer reviews and recent changes for staff review.
// Logic: ./handler.ts (pinned MODEL_ID, max_output_tokens, monthly token cap, usage log); prompt: ./prompt.ts (whitelisted
// fields, buyer text delimited via _shared/promptSafety.ts). Tests: handler.test.ts, scripts/summarize-*.test.ts,
// golden prompts in scripts/fixtures/ai-golden/.
// SETTINGS: portal_settings.ai_monthly_token_cap (migration 0015, default 2,000,000). USAGE: user_activity_logs rows with
// action_type 'ai_summary', details { model, prompt_tokens, completion_tokens, submission_id } — counts only, never text.
import { generateResponse, GatewayError, type OpenAIAstraResponsesFields } from 'npm:@lovable.dev/ai-gateway@0.1.13';
import { sanitizeAuditLogsForAi } from '../_shared/sanitizeChangesForAi.ts';
import { LINE_SELECT, SELECTION_SELECT, actorFor, staffIdsFromRoles } from './prompt.ts';
import {
  AI_TOKEN_CAP_KEY, AI_USAGE_ACTION, USAGE_PAGE_SIZE, handleSummarize, sumUsagePages, type ModelPayload, type SummarizeDeps,
} from './handler.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const srHeaders = { apikey: SRK, Authorization: `Bearer ${SRK}` };
const rest = async (path: string) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: srHeaders });
  if (!r.ok) throw new Error(`DB ${r.status}`);
  return r.json();
};
const UUID = /^[0-9a-f-]{36}$/i;

// The SDK types request payloads as `never` until `ai-gateway generate` has run, so the call is cast once. The compile-time
// check below keeps ModelPayload (minus `model`) assignable to the gateway's exported request fields for the pinned model:
// a field the gateway rejects for gpt-6-astra (temperature, effort 'minimal', …) fails `deno check`.
type PayloadFitsGateway = Omit<ModelPayload, 'model'> extends OpenAIAstraResponsesFields ? true : never;
const _payloadFitsGateway: PayloadFitsGateway = true;
const callGateway = generateResponse as unknown as (payload: ModelPayload) => Promise<unknown>;

const deps: SummarizeDeps = {
  async getUser(authorization) {
    const u = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: SRK, Authorization: authorization } });
    if (!u.ok) return null;
    const user = await u.json();
    return user?.id ? { id: String(user.id), email: typeof user.email === 'string' ? user.email : null } : null;
  },
  async isAdmin(userId) {
    const roles = await rest(`user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}&role=eq.admin`);
    return Array.isArray(roles) && roles.length > 0;
  },
  async loadInput(id) {
    // `email` is read only to recognise the buyer's own changes; it is split off and never reaches the prompt.
    const [rows, logs, lines] = await Promise.all([
      rest(`buyer_selections?select=${SELECTION_SELECT.join(',')},email&id=eq.${id}`),
      rest(`submission_audit_logs?select=created_at,action_type,changed_by_user_id,change_summary,changes&submission_id=eq.${id}&order=created_at.desc&limit=25`),
      rest(`quote_lines?select=${LINE_SELECT.join(',')}&submission_id=eq.${id}&status=neq.removed&order=sort_order.asc&limit=100`),
    ]) as [Record<string, unknown>[], Record<string, unknown>[], { id: string }[]];
    if (!rows.length) return null;
    const { email: buyerEmail, ...selection } = rows[0];
    const lineIds = lines.map(l => l.id).filter(x => UUID.test(x));
    const actorIds = [...new Set(logs.map(l => l.changed_by_user_id).filter((x): x is string => typeof x === 'string' && UUID.test(x)))];
    const [reviews, staff, profiles] = await Promise.all([
      lineIds.length
        ? rest(`quote_line_reviews?select=line_id,response,comment,created_at&line_id=in.(${lineIds.join(',')})&order=created_at.desc&limit=50`)
        : Promise.resolve([]),
      actorIds.length ? rest(`user_roles?select=user_id,role&user_id=in.(${actorIds.join(',')})`) : Promise.resolve([]),
      actorIds.length ? rest(`profiles?select=user_id,email&user_id=in.(${actorIds.join(',')})`) : Promise.resolve([]),
    ]) as [Record<string, unknown>[], unknown, { user_id: string; email: string | null }[]];
    const owner = typeof buyerEmail === 'string' ? buyerEmail.trim().toLowerCase() : '';
    const ctx = {
      // Labels only (who changed what); the admin gate is isAdmin above.
      staffUserIds: staffIdsFromRoles(staff),
      buyerUserIds: new Set(profiles.filter(p => owner && (p.email ?? '').trim().toLowerCase() === owner).map(p => p.user_id)),
    };
    // The prompt builder whitelists change keys; the blacklist sanitiser stays as a second layer.
    const changeLog = sanitizeAuditLogsForAi(logs).map(({ changed_by_user_id, ...entry }) => ({ ...entry, changed_by: actorFor(changed_by_user_id, ctx) }));
    return { selection, changeLog, lines, reviews };
  },
  async readTokenCapSetting() {
    const rows = await rest(`portal_settings?select=value&key=eq.${AI_TOKEN_CAP_KEY}`);
    return Array.isArray(rows) && rows.length ? rows[0].value : null;
  },
  // Pages through every row of the month (stable order); any page error throws, so the caller fails closed.
  tokensUsedSince: (since) => sumUsagePages((offset) => rest(
    `user_activity_logs?select=details&action_type=eq.${AI_USAGE_ACTION}&created_at=gte.${encodeURIComponent(since)}`
      + `&order=created_at.asc,id.asc&limit=${USAGE_PAGE_SIZE}&offset=${offset}`,
  )),
  callModel: (payload) => callGateway(payload),
  async logUsage(row) {
    const r = await fetch(`${URL_}/rest/v1/user_activity_logs`, {
      method: 'POST',
      headers: { ...srHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`usage log ${r.status}`);
  },
  now: () => new Date(),
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const out = await handleSummarize(req.headers.get('Authorization') || '', body, deps);
    return json(out.body, out.status);
  } catch (e) {
    if (e instanceof GatewayError) {
      const status = e.httpStatus === 429 ? 429 : e.httpStatus === 402 ? 402 : 502;
      const msg = status === 429 ? 'AI is busy right now, please try again shortly.'
        : status === 402 ? 'AI credits are used up for this workspace.' : 'AI summary failed.';
      console.error('gateway error', e.code, e.ids);
      return json({ error: msg }, status);
    }
    console.error(e instanceof Error ? e.message : e);
    return json({ error: 'Could not build summary' }, 500);
  }
});
