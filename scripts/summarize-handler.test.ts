// Task 17 (spec §6.15): summarize-upgrade-requests handler — pinned model, output cap, monthly token cap checked before
// the model call, usage logged as counts only. Deno subset: supabase/functions/summarize-upgrade-requests/handler.test.ts.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AI_TOKEN_CAP_KEY, DEFAULT_AI_MONTHLY_TOKEN_CAP, MAX_OUTPUT_TOKENS, MODEL_ID, USAGE_MAX_PAGES, USAGE_PAGE_SIZE, handleSummarize,
  outputText, sumUsagePages, usageFromResponse,
  type ModelPayload, type SummarizeDeps, type UsageRow,
} from '../supabase/functions/summarize-upgrade-requests/handler';
import { LINE_SELECT, SELECTION_SELECT, actorFor, staffIdsFromRoles } from '../supabase/functions/summarize-upgrade-requests/prompt';
import { AI_CAP_MESSAGE, summaryErrorMessage } from '../src/lib/aiSummaryError';

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
    tokensUsedSince: () => { order.push('used'); return Promise.resolve(10_000 - MAX_OUTPUT_TOKENS); },
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
  test('used + MAX_OUTPUT_TOKENS > cap → 402 ai_monthly_cap_reached; the model is never called', async () => {
    const { deps, calls, logs } = makeDeps({ tokensUsedSince: () => Promise.resolve(10_000 - MAX_OUTPUT_TOKENS + 1) });
    expect(await handleSummarize('Bearer t', { submissionId: SID }, deps)).toEqual({ status: 402, body: { error: 'ai_monthly_cap_reached' } });
    expect([calls.length, logs.length]).toEqual([0, 0]);
  });
  test('cap 0 disables summaries; an unset/invalid cap falls back to the default', async () => {
    const zero = makeDeps({ readTokenCapSetting: () => Promise.resolve(0), tokensUsedSince: () => Promise.resolve(0) });
    expect((await handleSummarize('Bearer t', { submissionId: SID }, zero.deps)).status).toBe(402);
    const unset = makeDeps({ readTokenCapSetting: () => Promise.resolve({ bad: true }), tokensUsedSince: () => Promise.resolve(DEFAULT_AI_MONTHLY_TOKEN_CAP - MAX_OUTPUT_TOKENS) });
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

describe('sumUsagePages', () => {
  const row = (p: number, c: number) => ({ details: { prompt_tokens: p, completion_tokens: c } });
  test('sums every full page and stops at the first short page', async () => {
    const offsets: number[] = [];
    const total = await sumUsagePages((offset) => {
      offsets.push(offset);
      const n = offset < 2 * USAGE_PAGE_SIZE ? USAGE_PAGE_SIZE : 3;
      return Promise.resolve(Array.from({ length: n }, () => row(2, 1)));
    });
    expect(offsets).toEqual([0, USAGE_PAGE_SIZE, 2 * USAGE_PAGE_SIZE]);
    expect(total).toBe((2 * USAGE_PAGE_SIZE + 3) * 3);
  });
  test('more than 1000 calls a month is not a refusal by itself', async () => {
    const total = await sumUsagePages((o) => Promise.resolve(o === 0 ? Array.from({ length: USAGE_PAGE_SIZE }, () => row(1, 0)) : [row(1, 0)]));
    expect(total).toBe(USAGE_PAGE_SIZE + 1);
  });
  test('fails closed: a page error or a non-array page throws; runaway paging throws', async () => {
    await expect(sumUsagePages(() => Promise.reject(new Error('DB 500')))).rejects.toThrow('DB 500');
    await expect(sumUsagePages(() => Promise.resolve({ message: 'x' }))).rejects.toThrow();
    let pages = 0;
    await expect(sumUsagePages(() => { pages++; return Promise.resolve(Array.from({ length: USAGE_PAGE_SIZE }, () => row(0, 0))); })).rejects.toThrow();
    expect(pages).toBe(USAGE_MAX_PAGES);
  });
  test('malformed details count as zero', async () => {
    expect(await sumUsagePages(() => Promise.resolve([{ details: null }, { details: { prompt_tokens: 'x', completion_tokens: -1 } }, row(5, 6)]))).toBe(11);
  });
});

describe('actorFor', () => {
  const ctx = { staffUserIds: new Set(['s1']), buyerUserIds: new Set(['b1', 's1']) };
  test('staff first, then buyer, else unknown', () => {
    expect([actorFor('s1', ctx), actorFor('b1', ctx), actorFor('x', ctx), actorFor(null, ctx)]).toEqual(['staff', 'buyer', 'unknown', 'unknown']);
  });
  test('staffIdsFromRoles keeps admin and staff roles only', () => {
    expect([...staffIdsFromRoles([{ user_id: 'a', role: 'admin' }, { user_id: 's', role: 'staff' }, { user_id: 'u', role: 'user' }, null])]).toEqual(['a', 's']);
    expect(staffIdsFromRoles(null).size).toBe(0);
  });
});

describe('admin UI error text', () => {
  test('402 + ai_monthly_cap_reached gets the budget message; others pass through', () => {
    expect(summaryErrorMessage(402, { error: 'ai_monthly_cap_reached' })).toBe(AI_CAP_MESSAGE);
    expect(AI_CAP_MESSAGE).toBe('Monthly AI budget reached — adjust in Settings');
    expect(summaryErrorMessage(402, { error: 'AI credits are used up for this workspace.' })).toBe('AI credits are used up for this workspace.');
    expect(summaryErrorMessage(429, { error: 'AI is busy right now, please try again shortly.' })).toBe('AI is busy right now, please try again shortly.');
    expect(summaryErrorMessage(null, null)).toBe('Please try again.');
  });
  test('UpgradeRequestSummary reads the error response status and body', () => {
    const src = readFileSync(join(import.meta.dir, '../src/components/admin/UpgradeRequestSummary.tsx'), 'utf8');
    expect(src).toContain('summaryErrorMessage(ctx?.status');
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
    expect(index).not.toContain('changed_by_email');
    expect(index).toContain('select=created_at,action_type,changed_by_user_id,change_summary,changes');
  });
  test('the gateway payload is type-checked against the pinned model\'s request fields', () => {
    expect(index).toContain("Omit<ModelPayload, 'model'> extends OpenAIAstraResponsesFields ? true : never");
    expect(index.match(/as unknown as/g)).toHaveLength(1);
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
