// Task 14: send-for-signature handler (staff gate, document checks, provider call, audit) + esign document helpers.
import { test, expect, describe } from 'bun:test';
import { handleSendForSignature, type SendDeps, type SendDocumentContext } from '../supabase/functions/send-for-signature/handler';
import { FakeEsignProvider } from '../supabase/functions/_shared/esign/fakeProvider';
import {
  documentTitle, parseStatusAfterSigned, safeUnitFolder, statusAdvancePatch, unitDocumentPath,
} from '../supabase/functions/_shared/esign/documents';
import { authorizeInternalOrAdmin } from '../supabase/functions/_shared/internalAuth';

const DOC = '22222222-2222-4222-8222-222222222222';
const staff = { ok: true as const, kind: 'staff' as const, email: 'noni@bmdmaterials.com', userId: 'u-noni' };

function harness(over: Partial<SendDocumentContext> | null = {}) {
  const provider = new FakeEsignProvider();
  const doc: SendDocumentContext | null = over === null ? null : {
    id: DOC, submissionId: 's1', kind: 'selection_sheet', status: 'draft', storagePath: `24/${DOC}.pdf`, snapshotId: 'snap1',
    unitNumber: '24', buyerName: 'Jane Buyer', buyerEmail: 'jane@example.com', ...over,
  };
  const sent: unknown[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const signed: string[] = [];
  const deps: SendDeps = {
    loadDocument: async () => doc,
    providerName: async () => 'fake',
    provider: (n) => (n === 'fake' ? provider : null),
    signedUrl: async (p, s) => { signed.push(`${p}:${s}`); return `https://signed.test/${p}`; },
    markSent: async (_id, patch) => { sent.push(patch); return true; },
    audit: async (row) => { audits.push(row); },
  };
  return { deps, provider, sent, audits, signed };
}

describe('send-for-signature handler', () => {
  test('staff: creates the provider document from a short-lived URL, marks sent, audits, returns the URL', async () => {
    const h = harness();
    const r = await handleSendForSignature({ document_id: DOC }, staff, h.deps);
    expect(r).toEqual({ status: 200, body: { embedded_signing_url: 'https://sign.fake.test/fake-doc-1', provider_document_id: 'fake-doc-1' } });
    expect(h.signed).toEqual([`24/${DOC}.pdf:600`]);
    expect(h.provider.created[0]).toMatchObject({
      pdfUrl: `https://signed.test/24/${DOC}.pdf`,
      title: 'Glendale Estates — Unit 24 — Selection sheet',
      signer: { name: 'Jane Buyer', email: 'jane@example.com' },
      metadata: { document_id: DOC, submission_id: 's1' },
    });
    expect(h.sent).toEqual([{ provider: 'fake', provider_envelope_id: 'fake-doc-1', status: 'sent', signer_email: 'jane@example.com' }]);
    expect(h.audits[0]).toMatchObject({ submission_id: 's1', action_type: 'esign_sent', changed_by_user_id: 'u-noni', changed_by_email: 'noni@bmdmaterials.com' });
  });
  test('admin allowed; unauthenticated 401; plain user / service role 403', async () => {
    expect((await handleSendForSignature({ document_id: DOC }, { ok: true, kind: 'admin', email: 'dan@x' }, harness().deps)).status).toBe(200);
    expect((await handleSendForSignature({ document_id: DOC }, { ok: false, status: 401 }, harness().deps)).status).toBe(401);
    expect((await handleSendForSignature({ document_id: DOC }, { ok: true, kind: 'user', email: 'b@x' }, harness().deps)).status).toBe(403);
    expect((await handleSendForSignature({ document_id: DOC }, { ok: true, kind: 'service' }, harness().deps)).status).toBe(403);
  });
  test('bad input and document states are refused before the provider is called', async () => {
    const cases: Array<[unknown, Partial<SendDocumentContext> | null, number]> = [
      [{}, {}, 400], [{ document_id: 'x' }, {}, 400], [{ document_id: DOC }, null, 404],
      [{ document_id: DOC }, { status: 'sent' }, 409], [{ document_id: DOC }, { status: 'signed' }, 409],
      [{ document_id: DOC }, { storagePath: null }, 409], [{ document_id: DOC }, { storagePath: `25/${DOC}.pdf` }, 409],
      [{ document_id: DOC }, { buyerEmail: '' }, 422],
    ];
    for (const [body, over, status] of cases) {
      const h = harness(over);
      expect((await handleSendForSignature(body, staff, h.deps)).status).toBe(status);
      expect(h.provider.created).toHaveLength(0);
    }
  });
  test('unknown provider setting → 501; concurrent send → 409 without audit', async () => {
    const h = harness();
    h.deps.providerName = async () => 'docusign';
    expect((await handleSendForSignature({ document_id: DOC }, staff, h.deps)).status).toBe(501);
    const c = harness();
    c.deps.markSent = async () => false;
    expect((await handleSendForSignature({ document_id: DOC }, staff, c.deps)).status).toBe(409);
    expect(c.audits).toHaveLength(0);
  });
});

describe('esign document helpers', () => {
  test('storage path is {unit_number}/{document_id}.pdf with a safe unit folder', () => {
    expect(unitDocumentPath('24', DOC)).toBe(`24/${DOC}.pdf`);
    expect(unitDocumentPath(' 3-B ', DOC.toUpperCase())).toBe(`3-B/${DOC}.pdf`);
    expect(safeUnitFolder('../etc')).toBe('etc');
    expect(safeUnitFolder('')).toBe('unknown-unit');
    expect(() => unitDocumentPath('24', '../x')).toThrow();
  });
  test('document title', () => {
    expect(documentTitle('24', 'change_order')).toBe('Glendale Estates — Unit 24 — Change order');
  });
  test('status after signed: default completed, null disables, unknown / "signed" ignored', () => {
    expect(parseStatusAfterSigned(undefined)).toBe('completed');
    expect(parseStatusAfterSigned('quoted')).toBe('quoted');
    expect(parseStatusAfterSigned(null)).toBeNull();
    expect(parseStatusAfterSigned('signed')).toBeNull();
    expect(statusAdvancePatch({ status: 'reviewed', reviewed_at: 'r' }, 'reviewed', 'T')).toBeNull();
    expect(statusAdvancePatch({ status: null }, 'completed', 'T')).toEqual({ status: 'completed', reviewed_at: 'T', quoted_at: 'T', completed_at: 'T' });
  });
});

describe('internalAuth allowStaff', () => {
  const env = { serviceRoleKey: 'svc' };
  const req = (jwt: string) => ({ headers: { get: (n: string) => (n === 'Authorization' ? `Bearer ${jwt}` : null) } });
  const getUser = async (jwt: string) =>
    jwt === 'staff' ? { email: 'noni@x', isStaff: true, id: 'u1' } : jwt === 'buyer' ? { email: 'b@x' } : null;
  test('staff JWT ok only with allowStaff', async () => {
    expect(await authorizeInternalOrAdmin(req('staff'), env, getUser, { allowStaff: true })).toEqual({ ok: true, kind: 'staff', email: 'noni@x', userId: 'u1' });
    expect(await authorizeInternalOrAdmin(req('staff'), env, getUser)).toEqual({ ok: false, status: 401 });
    expect(await authorizeInternalOrAdmin(req('buyer'), env, getUser, { allowStaff: true })).toEqual({ ok: false, status: 401 });
  });
});
