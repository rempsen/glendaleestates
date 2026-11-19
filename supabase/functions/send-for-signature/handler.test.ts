// Deno tests: `deno test supabase/functions/`. No-op under bun (full suite: scripts/esign-send-handler.test.ts).
import { handleSendForSignature, type SendDeps } from './handler.ts';
import { FakeEsignProvider } from '../_shared/esign/fakeProvider.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const ID = '22222222-2222-4222-8222-222222222222';
  const deps = (status = 'draft'): SendDeps => ({
    loadDocument: () => Promise.resolve({ id: ID, submissionId: 's', kind: 'selection_sheet', status, storagePath: `24/${ID}.pdf`, snapshotId: 'x', unitNumber: '24', buyerName: 'J B', buyerEmail: 'j@x.test' }),
    providerName: () => Promise.resolve('fake'),
    provider: () => new FakeEsignProvider(),
    signedUrl: (p) => Promise.resolve(`https://s.test/${p}`),
    claim: () => Promise.resolve(true),
    release: () => Promise.resolve(),
    markSent: () => Promise.resolve(true),
    audit: () => Promise.resolve(),
  });
  denoTest('staff send returns the embedded signing URL', async () => {
    const r = await handleSendForSignature({ document_id: ID }, { ok: true, kind: 'staff', email: 'n@x.test' }, deps());
    eq(r, { status: 200, body: { embedded_signing_url: 'https://sign.fake.test/fake-doc-1', provider_document_id: 'fake-doc-1' } });
  });
  denoTest('non-draft is refused', async () => {
    eq((await handleSendForSignature({ document_id: ID }, { ok: true, kind: 'staff', email: 'n@x.test' }, deps('signed'))).status, 409);
  });
}
