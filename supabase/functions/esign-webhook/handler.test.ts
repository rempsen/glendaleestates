// Deno tests: `deno test supabase/functions/`. No-op under bun (full suite: scripts/esign-webhook.test.ts).
import { handleEsignWebhook, type WebhookDeps } from './handler.ts';
import { FakeEsignProvider, FAKE_SIGNATURE_HEADER } from '../_shared/esign/fakeProvider.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const make = () => {
    const calls: string[] = [];
    const provider = new FakeEsignProvider('sec');
    provider.completed.set('fake-doc-1', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    let status = 'sent';
    const deps: WebhookDeps = {
      provider,
      findDocument: () => { calls.push('find'); return Promise.resolve({ id: '11111111-1111-4111-8111-111111111111', submissionId: 's', status, kind: 'k', unitNumber: '24', submission: { status: 'quoted' } }); },
      uploadPdf: () => { calls.push('upload'); return Promise.resolve(); },
      updateDocument: (_i, from, p) => { calls.push('update'); if (!from.includes(status)) return Promise.resolve(false); status = String(p.status); return Promise.resolve(true); },
      statusAfterSignedSetting: () => Promise.resolve('completed'),
      updateSubmission: () => { calls.push('sub'); return Promise.resolve(); },
      audit: () => { calls.push('audit'); return Promise.resolve(); },
      now: () => 'T',
    };
    return { deps, calls };
  };
  const raw = JSON.stringify({ event: 'signed', id: 'fake-doc-1' });
  const good = { get: (n: string) => (n === FAKE_SIGNATURE_HEADER ? FakeEsignProvider.sign('sec', raw) : null) };

  denoTest('invalid signature touches nothing', async () => {
    const h = make();
    eq((await handleEsignWebhook(raw, { get: () => 'bad' }, h.deps)).status, 401);
    eq(h.calls, []);
  });
  denoTest('signed once; redelivery is a no-op', async () => {
    const h = make();
    eq((await handleEsignWebhook(raw, good, h.deps)).body, { ok: true, status: 'signed', submission_status: 'completed' });
    eq((await handleEsignWebhook(raw, good, h.deps)).body, { ok: true, skipped: 'already signed' });
    eq(h.calls.filter((c) => c === 'audit').length, 1);
  });
}
