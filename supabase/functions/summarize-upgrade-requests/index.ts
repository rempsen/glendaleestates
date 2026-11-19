// Admin-only: AI summary of a buyer's upgrade requests, quote lines, buyer reviews and recent changes for staff review.
// Logic: ./handler.ts (pinned MODEL_ID, max_output_tokens, monthly token cap, usage log); prompt: ./prompt.ts (whitelisted
// fields, buyer text delimited via _shared/promptSafety.ts). Tests: handler.test.ts, scripts/summarize-*.test.ts,
// golden prompts in scripts/fixtures/ai-golden/.
// SETTINGS: portal_settings.ai_monthly_token_cap (migration 0015, default 2,000,000). USAGE: user_activity_logs rows with
// action_type 'ai_summary', details { model, prompt_tokens, completion_tokens, submission_id } — counts only, never text.
import { generateResponse, GatewayError } from 'npm:@lovable.dev/ai-gateway@0.1.13';
import { sanitizeAuditLogsForAi } from '../_shared/sanitizeChangesForAi.ts';
import { LINE_SELECT, SELECTION_SELECT } from './prompt.ts';
import { AI_TOKEN_CAP_KEY, AI_USAGE_ACTION, handleSummarize, type ModelPayload, type SummarizeDeps } from './handler.ts';

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
// PostgREST's default max-rows; a full page means the month's usage may be undercounted, so the cap fails closed.
const USAGE_PAGE = 1000;

// The SDK types request payloads as `never` until `ai-gateway generate` has run; the payload shape is pinned by ModelPayload.
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
    const [rows, logs, lines] = await Promise.all([
      rest(`buyer_selections?select=${SELECTION_SELECT.join(',')}&id=eq.${id}`),
      rest(`submission_audit_logs?select=created_at,action_type,changed_by_email,change_summary,changes&submission_id=eq.${id}&order=created_at.desc&limit=25`),
      rest(`quote_lines?select=${LINE_SELECT.join(',')}&submission_id=eq.${id}&status=neq.removed&order=sort_order.asc&limit=100`),
    ]);
    if (!rows.length) return null;
    const ids = (lines as { id: string }[]).map(l => l.id).filter(x => /^[0-9a-f-]{36}$/i.test(x));
    const reviews = ids.length
      ? await rest(`quote_line_reviews?select=line_id,response,comment,created_at&line_id=in.(${ids.join(',')})&order=created_at.desc&limit=50`)
      : [];
    // The prompt builder whitelists change keys; the blacklist sanitiser stays as a second layer.
    return { selection: rows[0], changeLog: sanitizeAuditLogsForAi(logs), lines, reviews };
  },
  async readTokenCapSetting() {
    const rows = await rest(`portal_settings?select=value&key=eq.${AI_TOKEN_CAP_KEY}`);
    return Array.isArray(rows) && rows.length ? rows[0].value : null;
  },
  async tokensUsedSince(since) {
    const rows = await rest(
      `user_activity_logs?select=details&action_type=eq.${AI_USAGE_ACTION}&created_at=gte.${encodeURIComponent(since)}&limit=${USAGE_PAGE}`,
    ) as { details: Record<string, unknown> | null }[];
    if (rows.length >= USAGE_PAGE) return Number.POSITIVE_INFINITY;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    return rows.reduce((s, r) => s + n(r.details?.prompt_tokens) + n(r.details?.completion_tokens), 0);
  },
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
