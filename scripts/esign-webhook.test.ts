// Task 14: esign-webhook handler — signature before DB, signed / declined / voided, idempotent redelivery, status advance.
import { test, expect, describe } from 'bun:test';
import { handleEsignWebhook, type WebhookDeps, type WebhookDocument } from '../supabase/functions/esign-webhook/handler';
import { FakeEsignProvider, FAKE_SIGNATURE_HEADER } from '../supabase/functions/_shared/esign/fakeProvider';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const NOW = '2026-11-18T20:00:00.000Z';

function harness(opts: { doc?: Partial<WebhookDocument> | null; setting?: unknown } = {}) {
  const provider = new FakeEsignProvider('sec');
  provider.completed.set('fake-doc-1', PDF);
  const doc: WebhookDocument | null = opts.doc === null ? null : {
    id: DOC_ID, submissionId: 's1', status: 'sent', kind: 'selection_sheet', unitNumber: '24',
    submission: { status: 'quoted', reviewed_at: 'r', quoted_at: 'q', completed_at: null }, ...(opts.doc ?? {}),
  };
  const calls: string[] = [];
  const uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  const docPatches: Array<{ from: string[]; patch: Record<string, unknown> }> = [];
  const subPatches: Array<Record<string, string>> = [];
  const audits: Array<{ action_type: string }> = [];
  const deps: WebhookDeps = {
    provider,
    async findDocument(p, id) { calls.push(`find:${p}:${id}`); return doc && { ...doc }; },
    async uploadPdf(path, bytes) { calls.push('upload'); uploads.push({ path, bytes }); },
    async updateDocument(_id, from, patch) {
      calls.push('updateDocument');
      if (!doc || !from.includes(doc.status)) return false;
      docPatches.push({ from, patch });
      doc.status = String(patch.status);
      return true;
    },
    async statusAfterSignedSetting() { calls.push('setting'); return 'setting' in opts ? opts.setting : 'completed'; },
    async updateSubmission(_id, patch) { calls.push('updateSubmission'); subPatches.push(patch); },
    async audit(row) { calls.push('audit'); audits.push(row); },
    now: () => NOW,
  };
  const event = (e: string, id = 'fake-doc-1') => {
    const raw = JSON.stringify({ event: e, id });
    return { raw, headers: { get: (n: string) => (n === FAKE_SIGNATURE_HEADER ? FakeEsignProvider.sign('sec', raw) : null) } };
  };
  return { deps, calls, uploads, docPatches, subPatches, audits, event, doc };
}

describe('esign-webhook signature gate', () => {
  test('invalid signature → 401 and no database or storage call at all', async () => {
    const h = harness();
    const { raw } = h.event('signed');
    const r = await handleEsignWebhook(raw, { get: (n) => (n === FAKE_SIGNATURE_HEADER ? 'forged' : null) }, h.deps);
    expect(r.status).toBe(401);
    expect(h.calls).toEqual([]);
  });
  test('missing signature → 401, no calls', async () => {
    const h = harness();
    const r = await handleEsignWebhook(h.event('signed').raw, { get: () => null }, h.deps);
    expect(r.status).toBe(401);
    expect(h.calls).toEqual([]);
  });
  test('a verifier that throws counts as invalid', async () => {
    const h = harness();
    h.deps.provider.verifyWebhook = () => Promise.reject(new Error('boom'));
    expect((await handleEsignWebhook('x', { get: () => null }, h.deps)).status).toBe(401);
    expect(h.calls).toEqual([]);
  });
});

describe('esign-webhook signed', () => {
  test('downloads the signed PDF over unit-documents/{unit}/{id}.pdf, marks signed, audits, advances status', async () => {
    const h = harness();
    const { raw, headers } = h.event('signed');
    const r = await handleEsignWebhook(raw, headers, h.deps);
    expect(r).toEqual({ status: 200, body: { ok: true, status: 'signed', submission_status: 'completed' } });
    expect(h.uploads).toEqual([{ path: `24/${DOC_ID}.pdf`, bytes: PDF }]);
    expect(h.docPatches[0].patch).toEqual({ status: 'signed', signed_at: NOW, storage_path: `24/${DOC_ID}.pdf` });
    expect(h.audits.map((a) => a.action_type)).toEqual(['esign_signed']);
    expect(h.subPatches).toEqual([{ status: 'completed', completed_at: NOW }]);
    expect(h.calls.indexOf('upload')).toBeLessThan(h.calls.indexOf('updateDocument'));
  });
  test('redelivery after signing is a 200 no-op (no upload, no audit)', async () => {
    const h = harness({ doc: { status: 'signed' } });
    const { raw, headers } = h.event('signed');
    expect(await handleEsignWebhook(raw, headers, h.deps)).toEqual({ status: 200, body: { ok: true, skipped: 'already signed' } });
    expect(h.calls.filter((c) => !c.startsWith('find'))).toEqual([]);
  });
  test('two deliveries in a row: second is a no-op', async () => {
    const h = harness();
    const { raw, headers } = h.event('signed');
    await handleEsignWebhook(raw, headers, h.deps);
    const again = await handleEsignWebhook(raw, headers, h.deps);
    expect(again.body).toEqual({ ok: true, skipped: 'already signed' });
    expect(h.audits).toHaveLength(1);
  });
  test('provider has no completed file → throws (500, provider retries); nothing written', async () => {
    const h = harness();
    const { raw, headers } = h.event('signed', 'fake-doc-2');
    h.deps.findDocument = async () => ({ id: DOC_ID, submissionId: 's1', status: 'sent', kind: 'x', unitNumber: '24', submission: { status: 'quoted' } });
    await expect(handleEsignWebhook(raw, headers, h.deps)).rejects.toThrow();
    expect(h.uploads).toHaveLength(0);
    expect(h.docPatches).toHaveLength(0);
  });
  test('status never moves backwards; JSON null setting leaves it alone', async () => {
    const done = harness({ doc: { submission: { status: 'completed', completed_at: 'c' } } });
    const e1 = done.event('signed');
    expect((await handleEsignWebhook(e1.raw, e1.headers, done.deps)).body).toEqual({ ok: true, status: 'signed' });
    expect(done.subPatches).toEqual([]);
    const off = harness({ setting: null });
    const e2 = off.event('signed');
    await handleEsignWebhook(e2.raw, e2.headers, off.deps);
    expect(off.subPatches).toEqual([]);
  });
  test('setting "quoted" from submitted stamps reviewed_at and quoted_at', async () => {
    const h = harness({ setting: 'quoted', doc: { submission: { status: 'submitted', reviewed_at: null, quoted_at: null } } });
    const e = h.event('signed');
    await handleEsignWebhook(e.raw, e.headers, h.deps);
    expect(h.subPatches).toEqual([{ status: 'quoted', reviewed_at: NOW, quoted_at: NOW }]);
  });
});

describe('esign-webhook declined / voided / other', () => {
  test('declined / voided not confirmed by the provider API (replayed hash, other document) → no write', async () => {
    const h = harness();
    const e = h.event('declined');
    expect((await handleEsignWebhook(e.raw, e.headers, h.deps)).body).toEqual({ ok: true, skipped: 'not confirmed by provider' });
    expect(h.docPatches).toEqual([]);
    expect(h.audits).toEqual([]);
  });
  test('declined sets the document status and audits once', async () => {
    const h = harness();
    (h.deps.provider as FakeEsignProvider).states.set('fake-doc-1', 'declined');
    const e = h.event('declined');
    expect((await handleEsignWebhook(e.raw, e.headers, h.deps)).body).toEqual({ ok: true, status: 'declined' });
    expect(h.docPatches[0]).toEqual({ from: ['draft', 'sent'], patch: { status: 'declined' } });
    expect(h.audits.map((a) => a.action_type)).toEqual(['esign_declined']);
    expect((await handleEsignWebhook(e.raw, e.headers, h.deps)).body).toEqual({ ok: true, skipped: 'already declined' });
    expect(h.subPatches).toEqual([]);
  });
  test('voided after signed is ignored', async () => {
    const h = harness({ doc: { status: 'signed' } });
    const e = h.event('voided');
    expect((await handleEsignWebhook(e.raw, e.headers, h.deps)).body).toEqual({ ok: true, skipped: 'already signed' });
    expect(h.docPatches).toEqual([]);
  });
  test('other events and unknown documents → 200 without writes', async () => {
    const h = harness();
    const e = h.event('viewed');
    expect((await handleEsignWebhook(e.raw, e.headers, h.deps)).status).toBe(200);
    expect(h.calls).toEqual([]);
    const u = harness({ doc: null });
    const e2 = u.event('signed');
    expect((await handleEsignWebhook(e2.raw, e2.headers, u.deps)).body).toEqual({ ok: true, skipped: 'unknown document' });
    expect(u.uploads).toHaveLength(0);
  });
});
