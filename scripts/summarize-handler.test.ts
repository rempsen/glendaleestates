// Task 17 (spec §6.15): summarize-upgrade-requests handler — pinned model, output cap, monthly token cap checked before
// the model call, usage logged as counts only. Deno subset: supabase/functions/summarize-upgrade-requests/handler.test.ts.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AI_TOKEN_CAP_KEY, DEFAULT_AI_MONTHLY_TOKEN_CAP, MAX_OUTPUT_TOKENS, MODEL_ID, handleSummarize, outputText, usageFromResponse,
  type ModelPayload, type SummarizeDeps, type UsageRow,
} from '../supabase/functions/summarize-upgrade-requests/handler';
import { LINE_SELECT, SELECTION_SELECT } from '../supabase/functions/summarize-upgrade-requests/prompt';

const SID = '11111111-2222-3333-4444-555555555555';
const fnDir = join(import.meta.dir, '../supabase/functions/summarize-upgrade-requests');
const read = (f: string) => readFileSync(join(fnDir, f), 'utf8');

function makeDeps(over: Partial<SummarizeDeps> = {}) {
  const calls: ModelPayload[] = [];
  const logs: UsageRow[] = [];
  const order: string[] = [];
  const deps: SummarizeDeps = {
    getUser: () => { order.push('user'); return Promise.resolve({ id: 'u1', email: 'a@x.test' }); },
    isAdmin: () => { order.push('admin'); return Promise.resolve(true); },
    loadInput: () => { order.push('load'); return Promise.resolve({ selection: { unit_number: '9', lvp_comments: 'SECRET-PROMPT-TEXT' }, changeLog: [], lines: [], reviews: [] }); },
    readTokenCapSetting: () => { order.push('cap'); return Promise.resolve(10_000); },
    tokensUsedSince: () => { order.push('used'); return Promise.resolve(9_999); },
    callModel: (p) => { order.push('model'); calls.push(p); return Promise.resolve({ output: [{ content: [{ type: 'output_text', text: 'A' }, { type: 'output_text', text: 'B' }] }], usage: { input_tokens: 10, output_tokens: 5 } }); },
    logUsage: (r) => { order.push('log'); logs.push(r); return Promise.resolve(); },
    now: () => new Date('2026-11-18T12:00:00Z'),
    ...over,
  };
  return { deps, calls, logs, order };
}

describe('handleSummarize', () => {
  test('order: auth → load → cap → model → log', async () => {
    const { deps, order, calls } = makeDeps();
    const out = await handleSummarize('Bearer t', { submissionId: SID }, deps);
    expect(out).toEqual({ status: 200, body: { summary: 'AB', generatedAt: '2026-11-18T12:00:00.000Z' } });
    expect(order).toEqual(['user', 'admin', 'load', 'cap', 'used', 'model', 'log']);
    expect(calls[0]).toMatchObject({ model: 'openai/gpt-6-astra', max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' } });
  });
  test('cap reached exactly → 429 ai_monthly_cap_reached; the model is never called', async () => {
    const { deps, calls, logs } = makeDeps({ tokensUsedSince: () => Promise.resolve(10_000) });
    expect(await handleSummarize('Bearer t', { submissionId: SID }, deps)).toEqual({ status: 429, body: { error: 'ai_monthly_cap_reached' } });
    expect([calls.length, logs.length]).toEqual([0, 0]);
  });
  test('cap 0 disables summaries; an unset/invalid cap falls back to the default', async () => {
    const zero = makeDeps({ readTokenCapSetting: () => Promise.resolve(0), tokensUsedSince: () => Promise.resolve(0) });
    expect((await handleSummarize('Bearer t', { submissionId: SID }, zero.deps)).status).toBe(429);
    const unset = makeDeps({ readTokenCapSetting: () => Promise.resolve({ bad: true }), tokensUsedSince: () => Promise.resolve(DEFAULT_AI_MONTHLY_TOKEN_CAP - 1) });
    expect((await handleSummarize('Bearer t', { submissionId: SID }, unset.deps)).status).toBe(200);
  });
  test('a failing usage query fails closed (throws, no model call)', async () => {
    const { deps, calls } = makeDeps({ tokensUsedSince: () => Promise.reject(new Error('DB 500')) });
    await expect(handleSummarize('Bearer t', { submissionId: SID }, deps)).rejects.toThrow('DB 500');
    expect(calls).toHaveLength(0);
  });
  test('usage row: counts only, never prompt text; a failed log still returns the summary', async () => {
    const { deps, logs } = makeDeps();
    await handleSummarize('Bearer t', { submissionId: SID }, deps);
    expect(logs).toEqual([{ action_type: 'ai_summary', performed_by_user_id: 'u1', performed_by_email: 'a@x.test', details: { model: MODEL_ID, prompt_tokens: 10, completion_tokens: 5, submission_id: SID } }]);
    expect(JSON.stringify(logs)).not.toContain('SECRET-PROMPT-TEXT');
    const failing = makeDeps({ logUsage: () => Promise.reject(new Error('insert failed')) });
    const origError = console.error; console.error = () => {};
    try { expect((await handleSummarize('Bearer t', { submissionId: SID }, failing.deps)).status).toBe(200); } finally { console.error = origError; }
  });
  test('400 on a bad id, 404 when the submission is missing, 401/403 before any load', async () => {
    expect((await handleSummarize('Bearer t', { submissionId: 'x' }, makeDeps().deps)).status).toBe(400);
    expect((await handleSummarize('Bearer t', { submissionId: SID }, makeDeps({ loadInput: () => Promise.resolve(null) }).deps)).status).toBe(404);
    const noUser = makeDeps({ getUser: () => Promise.resolve(null) });
    expect((await handleSummarize('Bearer t', { submissionId: SID }, noUser.deps)).status).toBe(401);
    const notAdmin = makeDeps({ isAdmin: () => Promise.resolve(false) });
    expect((await handleSummarize('Bearer t', { submissionId: SID }, notAdmin.deps)).status).toBe(403);
    expect(notAdmin.order).not.toContain('load');
  });
  test('usage / output parsing tolerates missing fields', () => {
    expect(usageFromResponse(null)).toEqual({ prompt_tokens: 0, completion_tokens: 0 });
    expect(usageFromResponse({ usage: { input_tokens: -3, output_tokens: 'x' } })).toEqual({ prompt_tokens: 0, completion_tokens: 0 });
    expect(outputText({ output_text: ' hi ' })).toBe('hi');
  });
});

describe('index.ts wiring (source guards)', () => {
  const index = read('index.ts');
  test('loader selects only whitelisted columns: no staff-only column is ever fetched', () => {
    for (const col of ['internal_note', 'sales_comments', 'admin_notes']) {
      expect(LINE_SELECT as readonly string[]).not.toContain(col);
      expect(SELECTION_SELECT as readonly string[]).not.toContain(col);
    }
    expect(index).toContain('select=${SELECTION_SELECT.join');
    expect(index).toContain('select=${LINE_SELECT.join');
    expect(index).not.toMatch(/select=\*/);
  });
  test('model id is pinned in one place; usage goes to user_activity_logs; cap key from settings', () => {
    expect(index).not.toMatch(/model:\s*['"]/);
    expect(read('handler.ts').match(/openai\/gpt-6-astra/g)).toHaveLength(1);
    expect(index).toContain('/rest/v1/user_activity_logs');
    expect(index).toContain('key=eq.${AI_TOKEN_CAP_KEY}');
    expect(AI_TOKEN_CAP_KEY).toBe('ai_monthly_token_cap');
    expect(index).not.toMatch(/console\.(log|error)\([^)]*prompt/);
  });
});
