// Task 14: console "Send for signature" flow — refusals, version increments, snapshot insert-only, buyer-safe PDF.
import { test, expect, describe } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buyerSafeLines, nextSnapshotVersion, sendForSignature, snapshotRefusal, snapshotTotals, type SendDeps,
} from '../src/lib/esignSend';
import type { QuoteLine } from '../src/lib/quoteLines';

const line = (o: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 1, section: 'flooring', location: 'Kitchen', label: 'LVP', unit: 'flat', pricing_mode: 'manual',
  status: 'upgrade', client_visible: true, source: 'office', provisional: false, amount: 1000, ...o,
} as QuoteLine);

const DOC = '33333333-3333-4333-8333-333333333333';

function harness(lines: QuoteLine[], opts: { versions?: number[]; gst?: number | null; flushFails?: boolean; raceOnce?: boolean; uploadFails?: boolean } = {}) {
  const ops: string[] = [];
  const versions = [...(opts.versions ?? [])];
  let raced = false;
  const snapshots: Array<Record<string, unknown>> = [];
  const rendered: QuoteLine[][] = [];
  const docs: Array<Record<string, unknown>> = [];
  const deps: SendDeps = {
    async flushSaved() { ops.push('flush'); return opts.flushFails ? { ok: false, reason: 'unsaved' } : { ok: true }; },
    current: () => ({ lines, gstRate: opts.gst === undefined ? 0.05 : opts.gst }),
    async existingVersions() { ops.push('select quote_snapshots'); return [...versions]; },
    async insertSnapshot(row) {
      ops.push('insert quote_snapshots');
      if (opts.raceOnce && !raced) { raced = true; versions.push(row.version); throw Object.assign(new Error('dup'), { code: '23505' }); }
      snapshots.push(row); versions.push(row.version);
      return { id: `snap-${row.version}`, version: row.version };
    },
    async renderBuyerPdf(l) { ops.push('render'); rendered.push(l); return new Blob(['%PDF-'], { type: 'application/pdf' }); },
    newId: () => DOC,
    async insertDocument(row) { ops.push('insert documents'); docs.push(row); },
    async voidDraftDocument() { ops.push('void documents'); },
    async upload(path) { ops.push(`upload ${path}`); if (opts.uploadFails) throw new Error('storage down'); },
    async sendForSignature(id) { ops.push(`send ${id}`); return { embedded_signing_url: 'https://sign.test/x' }; },
  };
  return { deps, ops, snapshots, rendered, docs };
}

const input = { submissionId: 's1', unitNumber: '24', buyerEmail: 'jane@example.com', purpose: 'quote' as const };

describe('snapshotRefusal', () => {
  test('refuses pending and under_review lines (they would be counted once answered)', () => {
    expect(snapshotRefusal([line({}), line({ status: 'pending', amount: null, label: 'Tile?' })], 0.05)).toContain('pending or under review');
    expect(snapshotRefusal([line({ status: 'under_review' })], 0.05)).toContain('1 line is');
  });
  test('refuses an upgrade line with no amount (totals incomplete) and a missing GST rate', () => {
    expect(snapshotRefusal([line({ amount: null })], 0.05)).toContain('no amount');
    expect(snapshotRefusal([line({})], null)).toContain('GST');
    expect(snapshotTotals([line({ amount: null })], 0.05)).toBeNull();
  });
  test('removed, included and deferred lines do not block', () => {
    expect(snapshotRefusal([line({}), line({ status: 'removed', amount: null }), line({ status: 'pending', amount: null })].filter((l) => l.status !== 'pending'), 0.05)).toBeNull();
    expect(snapshotRefusal([line({}), line({ status: 'included', amount: null }), line({ status: 'deferred', amount: null }), line({ status: 'removed' })], 0.05)).toBeNull();
    expect(snapshotRefusal([line({ status: 'removed' })], 0.05)).toContain('no lines');
  });
  test('totals = sumQuoteLines, rounded to cents', () => {
    expect(snapshotTotals([line({ amount: 1000 }), line({ amount: 333.33, section: 'window_coverings' })], 0.05)).toEqual({ subtotal: 1333.33, gst: 66.67, total: 1400 });
  });
});

describe('sendForSignature flow', () => {
  test('happy path order: flush → version → insert snapshot → render → documents row → upload → send', async () => {
    const h = harness([line({ internal_note: 'cost 600, margin ok' })], { versions: [1, 2] });
    const r = await sendForSignature(input, h.deps);
    expect(r).toEqual({ ok: true, documentId: DOC, snapshot: { id: 'snap-3', version: 3 }, embeddedSigningUrl: 'https://sign.test/x' });
    expect(h.ops).toEqual(['flush', 'select quote_snapshots', 'insert quote_snapshots', 'render', 'insert documents', `upload 24/${DOC}.pdf`, `send ${DOC}`]);
    expect(h.snapshots[0]).toMatchObject({ submission_id: 's1', version: 3, purpose: 'quote', subtotal: 1000, gst: 50, total: 1050 });
    expect(h.docs[0]).toEqual({ id: DOC, submission_id: 's1', snapshot_id: 'snap-3', kind: 'selection_sheet', status: 'draft', storage_path: `24/${DOC}.pdf`, signer_email: 'jane@example.com' });
  });
  test('staff snapshot keeps internal_note; the buyer PDF never gets it', async () => {
    const h = harness([line({ internal_note: 'secret' })]);
    await sendForSignature(input, h.deps);
    expect((h.snapshots[0].lines as QuoteLine[])[0].internal_note).toBe('secret');
    expect(h.rendered[0][0].internal_note).toBeNull();
    expect(buyerSafeLines([line({ internal_note: 'x' })])[0].internal_note).toBeNull();
  });
  test('refuses with a pending line: nothing is written', async () => {
    const h = harness([line({}), line({ status: 'pending', amount: null })]);
    const r = await sendForSignature(input, h.deps);
    expect(r.ok).toBe(false);
    expect(h.ops).toEqual(['flush']);
  });
  test('refuses when totals are null (unpriced upgrade): nothing is written', async () => {
    const h = harness([line({ amount: null })]);
    expect((await sendForSignature(input, h.deps)).ok).toBe(false);
    expect(h.ops).toEqual(['flush']);
  });
  test('refuses when the flush did not save everything', async () => {
    const h = harness([line({})], { flushFails: true });
    expect(await sendForSignature(input, h.deps)).toEqual({ ok: false, reason: 'unsaved' });
    expect(h.ops).toEqual(['flush']);
  });
  test('version increments per send and retries a unique-version race with a fresh max', async () => {
    expect(nextSnapshotVersion([])).toBe(1);
    expect(nextSnapshotVersion([3, 1, null])).toBe(4);
    const h = harness([line({})], { versions: [1] });
    await sendForSignature(input, h.deps);
    await sendForSignature(input, h.deps);
    expect(h.snapshots.map((s) => s.version)).toEqual([2, 3]);
    const race = harness([line({})], { versions: [1], raceOnce: true });
    await sendForSignature(input, race.deps);
    expect(race.snapshots.map((s) => s.version)).toEqual([3]);
  });
  test('the flow never updates or deletes a snapshot; a failed upload voids only the draft document row (no DELETE)', async () => {
    const h = harness([line({})], { uploadFails: true });
    await expect(sendForSignature(input, h.deps)).rejects.toThrow('storage down');
    expect(h.ops.filter((o) => o.includes('quote_snapshots'))).toEqual(['select quote_snapshots', 'insert quote_snapshots']);
    expect(h.ops).toContain('void documents');
    expect(h.ops.some((o) => o.startsWith('delete'))).toBe(false);
    expect(h.ops).not.toContain(`send ${DOC}`);
  });
  test('purpose maps to the document kind', async () => {
    const h = harness([line({})]);
    await sendForSignature({ ...input, purpose: 'change_order' }, h.deps);
    expect(h.docs[0].kind).toBe('change_order');
    expect(h.snapshots[0].purpose).toBe('change_order');
  });
});

describe('client never mutates quote_snapshots', () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(join(import.meta.dir, '..', 'src'));
  test('every .from(\'quote_snapshots\') chain is select or insert', () => {
    let seen = 0;
    for (const f of files) {
      if (f.endsWith('types.ts')) continue;
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(\s*['"]quote_snapshots['"]\s*\)\s*\.\s*(\w+)/g)) {
        seen++;
        expect(['select', 'insert'], `${f}: .${m[1]}`).toContain(m[1]);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
