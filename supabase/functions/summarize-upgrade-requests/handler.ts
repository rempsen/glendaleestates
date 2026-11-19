// summarize-upgrade-requests logic (spec §6.15). I/O is injected (deps) so the order is testable:
// admin check → load (whitelisted columns) → monthly token cap (refuse 402 before any model call) → model → usage log.
// The usage log carries counts only ({ model, prompt_tokens, completion_tokens, submission_id }), never prompt text.
import { buildSummaryPrompt, type SummaryPromptInput } from './prompt.ts';

/** Pinned gateway model id. The gateway exposes no dated variant of this slug; change only with a golden-eval rerun. */
export const MODEL_ID = 'openai/gpt-6-astra';
/** Hard cap on generated tokens per summary (Responses API `max_output_tokens`; includes reasoning tokens). */
export const MAX_OUTPUT_TOKENS = 2000;
export const AI_TOKEN_CAP_KEY = 'ai_monthly_token_cap';
export const DEFAULT_AI_MONTHLY_TOKEN_CAP = 2_000_000;
export const AI_USAGE_ACTION = 'ai_summary';
/** HTTP status for the monthly cap: 402, so the UI can tell it apart from the gateway's 429 rate limit. */
export const AI_CAP_STATUS = 402;
export const AI_CAP_ERROR = 'ai_monthly_cap_reached';
export const USAGE_PAGE_SIZE = 1000;
/** Upper bound on pages read (1,000,000 summaries a month); beyond it the sum throws and the caller fails closed. */
export const USAGE_MAX_PAGES = 1000;

export type ModelPayload = {
  model: typeof MODEL_ID;
  instructions: string;
  input: string;
  reasoning: { effort: 'low' };
  max_output_tokens: number;
};
export type UsageRow = {
  action_type: typeof AI_USAGE_ACTION;
  performed_by_user_id: string;
  performed_by_email: string | null;
  details: { model: string; prompt_tokens: number; completion_tokens: number; submission_id: string };
};
export type SummarizeDeps = {
  getUser(authorization: string): Promise<{ id: string; email: string | null } | null>;
  isAdmin(userId: string): Promise<boolean>;
  loadInput(submissionId: string): Promise<SummaryPromptInput | null>;
  readTokenCapSetting(): Promise<unknown>;
  /** Sum of prompt + completion tokens logged under AI_USAGE_ACTION since `since`. */
  tokensUsedSince(since: string): Promise<number>;
  callModel(payload: ModelPayload): Promise<unknown>;
  logUsage(row: UsageRow): Promise<void>;
  now(): Date;
};
export type HandlerResult = { status: number; body: Record<string, unknown> };

/** portal_settings value → cap. A finite number ≥ 0 is used (0 turns summaries off); anything else is the default. */
export function parseTokenCap(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_AI_MONTHLY_TOKEN_CAP;
}

/** Start of the current calendar month, UTC. */
export function monthStartUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Sum prompt + completion tokens over every page of usage rows; a short page ends the scan. Errors propagate. */
export async function sumUsagePages(fetchPage: (offset: number) => Promise<unknown>): Promise<number> {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  let total = 0;
  for (let page = 0; page < USAGE_MAX_PAGES; page++) {
    const rows = await fetchPage(page * USAGE_PAGE_SIZE);
    if (!Array.isArray(rows)) throw new Error('usage page is not an array');
    for (const r of rows) {
      const d = (r as { details?: Record<string, unknown> | null })?.details;
      total += n(d?.prompt_tokens) + n(d?.completion_tokens);
    }
    if (rows.length < USAGE_PAGE_SIZE) return total;
  }
  throw new Error('usage scan exceeded the page limit');
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Token counts from a Responses API result (`usage.input_tokens` / `usage.output_tokens`). */
export function usageFromResponse(res: unknown): { prompt_tokens: number; completion_tokens: number } {
  const u = (res as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  return { prompt_tokens: count(u.input_tokens ?? u.prompt_tokens), completion_tokens: count(u.output_tokens ?? u.completion_tokens) };
}

export function outputText(res: unknown): string {
  const r = (res ?? {}) as { output_text?: unknown; output?: unknown };
  if (typeof r.output_text === 'string' && r.output_text) return r.output_text.trim();
  let text = '';
  if (Array.isArray(r.output)) {
    for (const item of r.output) {
      for (const c of (item as { content?: unknown[] })?.content ?? []) {
        const part = c as { type?: string; text?: string };
        if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
      }
    }
  }
  return text.trim();
}

export async function handleSummarize(authorization: string, body: unknown, deps: SummarizeDeps): Promise<HandlerResult> {
  if (!authorization.startsWith('Bearer ')) return { status: 401, body: { error: 'Unauthorized' } };
  const user = await deps.getUser(authorization);
  if (!user) return { status: 401, body: { error: 'Unauthorized' } };
  if (!(await deps.isAdmin(user.id))) return { status: 403, body: { error: 'Forbidden' } };

  const id = typeof (body as { submissionId?: unknown })?.submissionId === 'string' ? (body as { submissionId: string }).submissionId : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 400, body: { error: 'submissionId is required' } };

  const input = await deps.loadInput(id);
  if (!input) return { status: 404, body: { error: 'Not found' } };

  const cap = parseTokenCap(await deps.readTokenCapSetting());
  const used = await deps.tokensUsedSince(monthStartUtc(deps.now()));
  // Reserve this call's worst-case output. Concurrent admin calls read the same `used`, so the month can still overshoot
  // the cap by up to one request per concurrent caller.
  if (used + MAX_OUTPUT_TOKENS > cap) return { status: AI_CAP_STATUS, body: { error: AI_CAP_ERROR } };

  const prompt = buildSummaryPrompt(input);
  const res = await deps.callModel({
    model: MODEL_ID, instructions: prompt.instructions, input: prompt.input, reasoning: { effort: 'low' }, max_output_tokens: MAX_OUTPUT_TOKENS,
  });
  const usage = usageFromResponse(res);
  try {
    await deps.logUsage({
      action_type: AI_USAGE_ACTION, performed_by_user_id: user.id, performed_by_email: user.email,
      details: { model: MODEL_ID, ...usage, submission_id: id },
    });
  } catch (e) {
    console.error('ai usage log failed', e instanceof Error ? e.message : e);
  }
  return { status: 200, body: { summary: outputText(res), generatedAt: deps.now().toISOString() } };
}
