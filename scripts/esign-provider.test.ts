// Task 14: EsignProvider contract (FakeEsignProvider and SignWell over a stubbed fetch) + SignWell request / webhook shapes.
import { test, expect, describe } from 'bun:test';
import type { EsignProvider, HeaderBag } from '../supabase/functions/_shared/esign/provider';
import { FakeEsignProvider, FAKE_SIGNATURE_HEADER } from '../supabase/functions/_shared/esign/fakeProvider';
import { createSignWellProvider, hmacSha256Hex, signWellTestMode, type FetchLike } from '../supabase/functions/_shared/esign/signwell';
import { providerFromEnv } from '../supabase/functions/_shared/esign/providerFromEnv';

const headers = (h: Record<string, string> = {}): HeaderBag => ({ get: (n) => h[n.toLowerCase()] ?? null });
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const input = {
  pdfUrl: 'https://x.supabase.co/storage/v1/object/sign/unit-documents/24/d.pdf?token=t',
  fileName: 'Unit-24-selection_sheet.pdf',
  title: 'Glendale Estates — Unit 24 — Selection sheet',
  signer: { name: 'Jane Buyer', email: 'jane@example.com' },
  metadata: { document_id: 'd1', submission_id: 's1' },
};

type Call = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
function signWellStub() {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://www.signwell.com/api/v1/documents' && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'sw-1', recipients: [{ id: '1', email: 'jane@example.com', embedded_signing_url: 'https://www.signwell.com/docs/embed/abc' }] }), { status: 201 });
    }
    if (url === 'https://www.signwell.com/api/v1/documents/sw-1') return new Response(JSON.stringify({ id: 'sw-1', status: 'Declined' }), { status: 200 });
    if (url === 'https://www.signwell.com/api/v1/documents/sw-1/completed_pdf?url_only=false&audit_page=true') {
      return new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf' } });
    }
    if (url === 'https://www.signwell.com/api/v1/documents/sw-2/completed_pdf?url_only=false&audit_page=true') {
      return new Response(JSON.stringify({ error: 'not a pdf' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { calls, fetch };
}

const SECRET = 'whsec-test';
async function signWellEvent(type: string, docId = 'sw-1', secret = SECRET) {
  const time = 1795900000;
  return JSON.stringify({ event: { type, time, hash: await hmacSha256Hex(secret, `${type}@${time}`) }, data: { object: { id: docId, status: 'Completed' } } });
}

interface Harness {
  provider: EsignProvider;
  signedEvent(): Promise<{ raw: string; headers: HeaderBag }>;
  complete(id: string): void;
}

const harnesses: Record<string, () => Harness> = {
  fake: () => {
    const p = new FakeEsignProvider('s3cret');
    return {
      provider: p,
      async signedEvent() {
        const raw = JSON.stringify({ event: 'signed', id: 'fake-doc-1' });
        return { raw, headers: headers({ [FAKE_SIGNATURE_HEADER]: FakeEsignProvider.sign('s3cret', raw) }) };
      },
      complete: (id) => p.completed.set(id, PDF),
    };
  },
  signwell: () => {
    const stub = signWellStub();
    return {
      provider: createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: true, fetch: stub.fetch }),
      async signedEvent() { return { raw: await signWellEvent('document_completed'), headers: headers() }; },
      complete: () => undefined,
    };
  },
};

for (const [name, make] of Object.entries(harnesses)) {
  describe(`EsignProvider contract: ${name}`, () => {
    test('createDocument returns a provider id and an embedded signing URL', async () => {
      const h = make();
      const r = await h.provider.createDocument(input);
      expect(r.providerDocumentId).toBeTruthy();
      expect(r.embeddedSigningUrl).toMatch(/^https:\/\//);
    });
    test('createDocument without a PDF rejects', async () => {
      const h = make();
      await expect(h.provider.createDocument({ ...input, pdfUrl: undefined })).rejects.toThrow();
    });
    test('verifyWebhook: valid true, tampered false, missing signature false', async () => {
      const h = make();
      const { raw, headers: hd } = await h.signedEvent();
      expect(await h.provider.verifyWebhook(raw, hd)).toBe(true);
      const tampered = raw.replace(/signed|document_completed/, (m) => (m === 'signed' ? 'voided' : 'document_canceled'));
      expect(await h.provider.verifyWebhook(tampered, hd)).toBe(false);
      expect(await h.provider.verifyWebhook(JSON.stringify({}), headers())).toBe(false);
      expect(await h.provider.verifyWebhook('not json', headers())).toBe(false);
    });
    test('parseWebhook maps the completed event to signed with the provider id; garbage → other', async () => {
      const h = make();
      const { raw } = await h.signedEvent();
      const p = h.provider.parseWebhook(raw);
      expect(p.event).toBe('signed');
      expect(p.providerDocumentId).toBeTruthy();
      expect(h.provider.parseWebhook('{{').event).toBe('other');
    });
    test('downloadSignedPdf returns PDF bytes for a completed document', async () => {
      const h = make();
      const created = await h.provider.createDocument(input);
      h.complete(created.providerDocumentId);
      const bytes = await h.provider.downloadSignedPdf(created.providerDocumentId);
      expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('%PDF');
    });
    test('downloadSignedPdf rejects for an unknown / uncompleted document', async () => {
      await expect(make().provider.downloadSignedPdf('nope')).rejects.toThrow();
    });
  });
}

describe('SignWell specifics', () => {
  test('create: POST /api/v1/documents/ with X-Api-Key, embedded signing, test mode, signer and metadata', async () => {
    const stub = signWellStub();
    const p = createSignWellProvider({ apiKey: 'live-key', webhookSecret: SECRET, testMode: true, fetch: stub.fetch });
    await p.createDocument(input);
    const c = stub.calls[0];
    expect(c.url).toBe('https://www.signwell.com/api/v1/documents');
    expect(c.init?.headers?.['X-Api-Key']).toBe('live-key');
    const body = JSON.parse(c.init?.body ?? '{}');
    expect(body).toMatchObject({
      test_mode: true, embedded_signing: true, with_signature_page: true, draft: false, name: input.title,
      files: [{ name: input.fileName, file_url: input.pdfUrl }],
      recipients: [{ id: '1', name: 'Jane Buyer', email: 'jane@example.com' }],
      metadata: { document_id: 'd1', submission_id: 's1' },
    });
  });
  test('pdfBytes are sent as file_base64', async () => {
    const stub = signWellStub();
    const p = createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: false, fetch: stub.fetch });
    await p.createDocument({ ...input, pdfUrl: undefined, pdfBytes: PDF });
    const body = JSON.parse(stub.calls[0].init?.body ?? '{}');
    expect(body.test_mode).toBe(false);
    expect(body.files[0]).toEqual({ name: input.fileName, file_base64: btoa('%PDF-1') });
  });
  test('missing API key fails before any request', async () => {
    const stub = signWellStub();
    const p = createSignWellProvider({ apiKey: undefined, webhookSecret: SECRET, testMode: true, fetch: stub.fetch });
    await expect(p.createDocument(input)).rejects.toThrow('SIGNWELL_API_KEY');
    expect(stub.calls).toHaveLength(0);
  });
  test('HTTP error surfaces', async () => {
    const p = createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: true, fetch: async () => new Response('bad', { status: 422 }) });
    await expect(p.createDocument(input)).rejects.toThrow('HTTP 422');
  });
  test('webhook: hash under another secret, missing secret, missing hash → false', async () => {
    const p = createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: true });
    expect(await p.verifyWebhook(await signWellEvent('document_completed', 'sw-1', 'other-secret'), headers())).toBe(false);
    const noSecret = createSignWellProvider({ apiKey: 'k', webhookSecret: undefined, testMode: true });
    expect(await noSecret.verifyWebhook(await signWellEvent('document_completed'), headers())).toBe(false);
    const noHash = JSON.parse(await signWellEvent('document_completed'));
    delete noHash.event.hash;
    expect(await p.verifyWebhook(JSON.stringify(noHash), headers())).toBe(false);
  });
  test('event mapping', async () => {
    const p = createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: true });
    expect(p.parseWebhook(await signWellEvent('document_declined')).event).toBe('declined');
    expect(p.parseWebhook(await signWellEvent('document_canceled')).event).toBe('voided');
    expect(p.parseWebhook(await signWellEvent('document_expired')).event).toBe('voided');
    expect(p.parseWebhook(await signWellEvent('document_viewed')).event).toBe('other');
    expect(p.parseWebhook(await signWellEvent('document_signed')).event).toBe('other'); // one signer signed; not completed
  });
  test('downloadSignedPdf: one GET completed_pdf?url_only=false&audit_page=true, raw bytes, %PDF- magic enforced', async () => {
    const stub = signWellStub();
    const p = createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: true, fetch: stub.fetch });
    expect(await p.downloadSignedPdf('sw-1')).toEqual(PDF);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].init?.headers?.['X-Api-Key']).toBe('k');
    await expect(p.downloadSignedPdf('sw-2')).rejects.toThrow('not a PDF');
  });
  test('confirmStatus reads GET /documents/{id}/ status', async () => {
    const stub = signWellStub();
    const p = createSignWellProvider({ apiKey: 'k', webhookSecret: SECRET, testMode: true, fetch: stub.fetch });
    expect(await p.confirmStatus?.('sw-1')).toBe('declined');
    expect(stub.calls[0].url).toBe('https://www.signwell.com/api/v1/documents/sw-1');
    expect(stub.calls[0].init?.headers?.['X-Api-Key']).toBe('k');
  });
  test('SIGNWELL_TEST_MODE defaults to true; only "false" turns it off', () => {
    expect(signWellTestMode(undefined)).toBe(true);
    expect(signWellTestMode('')).toBe(true);
    expect(signWellTestMode('true')).toBe(true);
    expect(signWellTestMode(' FALSE ')).toBe(false);
  });
  test('providerFromEnv builds SignWell from env only; unknown provider → null', () => {
    const seen: string[] = [];
    const p = providerFromEnv('signwell', (k) => { seen.push(k); return undefined; });
    expect(p?.name).toBe('signwell');
    expect(seen.sort()).toEqual(['SIGNWELL_API_KEY', 'SIGNWELL_TEST_MODE', 'SIGNWELL_WEBHOOK_SECRET']);
    expect(providerFromEnv('docusign', () => undefined)).toBeNull();
  });
});
