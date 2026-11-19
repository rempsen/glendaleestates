// Service-role PostgREST + Storage I/O for send-for-signature and esign-webhook. Plain fetch (no supabase-js) so the
// functions type-check offline, like notifyTransport.ts. Secrets come from env only.
import { UNIT_DOCUMENTS_BUCKET } from './documents.ts';

export interface ServiceRest {
  get<T = unknown>(path: string): Promise<T>;
  post(path: string, body: unknown): Promise<void>;
  /** PATCH with return=representation; resolves to the number of rows changed. */
  patch(path: string, body: unknown): Promise<number>;
  signedUrl(objectPath: string, expiresIn: number): Promise<string>;
  uploadPdf(objectPath: string, bytes: Uint8Array): Promise<void>;
}

const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export function serviceRest(supabaseUrl: string, serviceKey: string): ServiceRest {
  const base = supabaseUrl.replace(/\/+$/, '');
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const json = { ...auth, 'Content-Type': 'application/json' };
  return {
    async get<T>(path: string): Promise<T> {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers: auth });
      if (!r.ok) throw new Error(`GET ${path.split('?')[0]}: HTTP ${r.status} ${await r.text()}`);
      return await r.json() as T;
    },
    async post(path: string, body: unknown): Promise<void> {
      const r = await fetch(`${base}/rest/v1/${path}`, { method: 'POST', headers: { ...json, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`POST ${path}: HTTP ${r.status} ${await r.text()}`);
    },
    async patch(path: string, body: unknown): Promise<number> {
      const r = await fetch(`${base}/rest/v1/${path}`, { method: 'PATCH', headers: { ...json, Prefer: 'return=representation' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`PATCH ${path.split('?')[0]}: HTTP ${r.status} ${await r.text()}`);
      const rows = await r.json();
      return Array.isArray(rows) ? rows.length : 0;
    },
    async signedUrl(objectPath: string, expiresIn: number): Promise<string> {
      const r = await fetch(`${base}/storage/v1/object/sign/${UNIT_DOCUMENTS_BUCKET}/${encPath(objectPath)}`, {
        method: 'POST', headers: json, body: JSON.stringify({ expiresIn }),
      });
      if (!r.ok) throw new Error(`sign ${objectPath}: HTTP ${r.status} ${await r.text()}`);
      const j = await r.json() as { signedURL?: string };
      if (!j.signedURL) throw new Error('sign: no signedURL');
      return `${base}/storage/v1${j.signedURL.startsWith('/') ? '' : '/'}${j.signedURL}`;
    },
    async uploadPdf(objectPath: string, bytes: Uint8Array): Promise<void> {
      const r = await fetch(`${base}/storage/v1/object/${UNIT_DOCUMENTS_BUCKET}/${encPath(objectPath)}`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, body: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      });
      if (!r.ok) throw new Error(`upload ${objectPath}: HTTP ${r.status} ${await r.text()}`);
    },
  };
}
