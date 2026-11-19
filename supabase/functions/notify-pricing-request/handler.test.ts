// Deno tests: `deno test supabase/functions/`. No-op under bun (full suite: scripts/pricing-notify.test.ts).
import { handleNotify, type NotifyDeps } from './handler.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  denoTest('re-delivery with the same flagged_at sends one card', async () => {
    const claimed = new Set<string>();
    let cards = 0;
    const deps: NotifyDeps = {
      portalBase: 'https://p.test',
      getTeamsUrl: () => Promise.resolve('https://x.logic.azure.com/w'),
      loadLine: () => Promise.resolve({
        lineId: 'l1', submissionId: 's1', flaggedTo: 'u1', flaggedAt: 'T', status: 'pending', unit: '24', buyerName: 'J',
        location: '', label: 'L', product: null, colour: null, internalNote: null, assigneeName: 'B', assigneeEmail: 'b@x.test',
      }),
      claim: (k) => Promise.resolve(claimed.has(k) ? false : (claimed.add(k), true)),
      release: (k) => { claimed.delete(k); return Promise.resolve(); },
      postTeams: () => { cards++; return Promise.resolve({ ok: true }); },
      sendEmail: () => Promise.resolve({ ok: true }),
    };
    const p = { type: 'INSERT', table: 'quote_lines', record: { id: 'l1', flagged_to: 'u1', flagged_at: 'T', status: 'pending' }, old_record: null };
    await handleNotify(p, { ok: true, kind: 'service' }, deps);
    eq((await handleNotify(p, { ok: true, kind: 'service' }, deps)).body, { ok: true, skipped: 'duplicate' });
    eq(cards, 1);
  });
}
