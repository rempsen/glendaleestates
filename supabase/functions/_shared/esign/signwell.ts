// SignWell implementation of EsignProvider (spec ADR-1). REST: https://www.signwell.com/api/v1, header X-Api-Key.
// Secrets come from env only (SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_SECRET); never portal_settings.
//
// VERIFY AT DEPLOY (written from SignWell's documented shapes; the docs site was not reachable from the build agent):
//  - Create: POST /documents/ with files[{name, file_url|file_base64}], recipients[{id,name,email}], embedded_signing,
//    with_signature_page (no placed fields), test_mode, metadata. Response: id, recipients[].embedded_signing_url.
//  - Webhook "Event Hash Verification": event.hash = hex HMAC-SHA256(key = webhook secret/id, message =
//    `${event.type}@${event.time}`). The hash does not cover the body, so the webhook handler never trusts a body's
//    status alone: a 'signed' event is acted on only after GET /documents/{id}/completed_pdf/ returns the file.
//  - GET /documents/{id}/ → status "Completed" | "Declined" | "Canceled" | "Expired" | … (confirmStatus).
//  - Events: document_completed → signed; document_declined → declined; document_canceled / document_expired → voided.
import {
  EsignProviderError,
  type CreateDocumentInput, type CreatedDocument, type EsignEventKind, type EsignProvider, type HeaderBag, type ParsedWebhook,
} from './provider.ts';

export const SIGNWELL_API_BASE = 'https://www.signwell.com/api/v1';

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>;

export interface SignWellConfig {
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  /** true unless SIGNWELL_TEST_MODE is exactly "false" (SignWell's unlimited test tier until Dan flips it). */
  testMode: boolean;
  fetch?: FetchLike;
  apiBase?: string;
}

/** Env → testMode: anything but the literal "false" keeps test mode on. */
export const signWellTestMode = (raw: string | undefined | null): boolean => (raw ?? '').trim().toLowerCase() !== 'false';

const EVENT_MAP: Record<string, EsignEventKind> = {
  document_completed: 'signed',
  document_declined: 'declined',
  document_canceled: 'voided',
  document_cancelled: 'voided',
  document_expired: 'voided',
};

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', k, enc.encode(message)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

interface SignWellEvent { event?: { type?: unknown; time?: unknown; hash?: unknown }; data?: { object?: { id?: unknown } } }

function readEvent(rawBody: string): SignWellEvent | null {
  try {
    const j = JSON.parse(rawBody);
    return j && typeof j === 'object' ? j as SignWellEvent : null;
  } catch {
    return null;
  }
}

export function createSignWellProvider(cfg: SignWellConfig): EsignProvider {
  const doFetch: FetchLike = cfg.fetch ?? ((u, i) => fetch(u, i));
  const base = (cfg.apiBase ?? SIGNWELL_API_BASE).replace(/\/+$/, '');
  const headers = (): Record<string, string> => {
    if (!cfg.apiKey) throw new EsignProviderError('SIGNWELL_API_KEY is not configured');
    return { 'X-Api-Key': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' };
  };

  return {
    name: 'signwell',

    async createDocument(input: CreateDocumentInput): Promise<CreatedDocument> {
      if (!input.pdfUrl && !input.pdfBytes) throw new EsignProviderError('createDocument needs pdfUrl or pdfBytes');
      const file = input.pdfUrl
        ? { name: input.fileName, file_url: input.pdfUrl }
        : { name: input.fileName, file_base64: bytesToBase64(input.pdfBytes as Uint8Array) };
      const body = {
        test_mode: cfg.testMode,
        name: input.title,
        subject: input.title,
        files: [file],
        recipients: [{ id: '1', name: input.signer.name, email: input.signer.email }],
        embedded_signing: true,
        embedded_signing_notifications: false,
        with_signature_page: true,
        draft: false,
        metadata: input.metadata,
      };
      const r = await doFetch(`${base}/documents/`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const text = await r.text();
      if (!r.ok) throw new EsignProviderError(`SignWell create document: HTTP ${r.status} ${text.slice(0, 300)}`, r.status);
      let j: { id?: unknown; recipients?: Array<{ email?: unknown; embedded_signing_url?: unknown }> };
      try { j = JSON.parse(text); } catch { throw new EsignProviderError('SignWell create document: response is not JSON'); }
      const id = typeof j.id === 'string' ? j.id : null;
      const recips = Array.isArray(j.recipients) ? j.recipients : [];
      const mine = recips.find((x) => typeof x.email === 'string' && x.email.toLowerCase() === input.signer.email.toLowerCase()) ?? recips[0];
      const url = mine && typeof mine.embedded_signing_url === 'string' ? mine.embedded_signing_url : null;
      if (!id || !url) throw new EsignProviderError('SignWell create document: response has no id or embedded_signing_url');
      return { providerDocumentId: id, embeddedSigningUrl: url };
    },

    async verifyWebhook(rawBody: string, _headers: HeaderBag): Promise<boolean> {
      if (!cfg.webhookSecret) return false;
      const ev = readEvent(rawBody)?.event;
      if (!ev || typeof ev.type !== 'string' || !ev.type || typeof ev.hash !== 'string' || !ev.hash) return false;
      if (typeof ev.time !== 'number' && typeof ev.time !== 'string') return false;
      const expected = await hmacSha256Hex(cfg.webhookSecret, `${ev.type}@${ev.time}`);
      return constantTimeEqual(expected, ev.hash.toLowerCase());
    },

    parseWebhook(rawBody: string): ParsedWebhook {
      const j = readEvent(rawBody);
      const type = typeof j?.event?.type === 'string' ? j.event.type : '';
      const id = j?.data?.object?.id;
      return { event: EVENT_MAP[type] ?? 'other', providerDocumentId: typeof id === 'string' && id ? id : null, rawType: type };
    },

    async confirmStatus(providerDocumentId: string): Promise<EsignEventKind | 'open'> {
      const r = await doFetch(`${base}/documents/${encodeURIComponent(providerDocumentId)}/`, { headers: headers() });
      if (!r.ok) throw new EsignProviderError(`SignWell get document: HTTP ${r.status}`, r.status);
      const j = await r.json().catch(() => ({})) as { status?: unknown };
      const st = typeof j.status === 'string' ? j.status.trim().toLowerCase() : '';
      if (st === 'completed') return 'signed';
      if (st === 'declined') return 'declined';
      if (st === 'canceled' || st === 'cancelled' || st === 'expired' || st === 'voided') return 'voided';
      return 'open';
    },

    async downloadSignedPdf(providerDocumentId: string): Promise<Uint8Array> {
      const h = headers();
      const r = await doFetch(`${base}/documents/${encodeURIComponent(providerDocumentId)}/completed_pdf/?url_only=true&audit_page=true`, { headers: h });
      if (!r.ok) throw new EsignProviderError(`SignWell completed_pdf: HTTP ${r.status}`, r.status);
      const type = r.headers.get('content-type') ?? '';
      if (type.includes('application/pdf')) return new Uint8Array(await r.arrayBuffer());
      const j = await r.json().catch(() => ({})) as { file_url?: unknown };
      if (typeof j.file_url !== 'string' || !/^https:\/\//.test(j.file_url)) throw new EsignProviderError('SignWell completed_pdf: no file_url');
      const f = await doFetch(j.file_url);
      if (!f.ok) throw new EsignProviderError(`SignWell completed file: HTTP ${f.status}`, f.status);
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new EsignProviderError('SignWell completed file is not a PDF');
      return bytes;
    },
  };
}
