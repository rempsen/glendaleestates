// Deno tests: `deno test supabase/functions/`. No-op under bun (mapper suite: scripts/qbo-lines-map.test.ts).
import { handleQboSync, type MapRow, type QboApi, type SyncDeps } from './handler.ts';
import type { QuoteLine } from '../_shared/quoteLines.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const ok = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const line = (over: Partial<QuoteLine>): QuoteLine => ({
    sort_order: 1, section: 'flooring', location: 'Bedrooms', label: 'Premium carpet', unit: 'flat', pricing_mode: 'catalog',
    status: 'upgrade', client_visible: true, source: 'wizard', provisional: false, amount: 100, ...over,
  });

  class FakeQbo implements QboApi {
    items: Array<{ Id: string; Name: string; Sku?: string }> = [];
    queries: string[] = [];
    posts: Array<{ path: string; body: Record<string, unknown> }> = [];
    created = 0;
    customers: Array<{ Id: string; DisplayName: string; Job?: boolean; ParentRef?: { value: string } }> = [];
    totalSkew = 0;
    query(sql: string) {
      this.queries.push(sql);
      const item = sql.match(/FROM Item WHERE (Sku|Name) = '([^']*)'/);
      if (item) {
        const hit = this.items.find((i) => (item[1] === 'Sku' ? i.Sku : i.Name) === item[2]);
        return Promise.resolve(hit ? { Item: [{ ...hit, SyncToken: '0' }] } : {});
      }
      const cust = sql.match(/FROM Customer WHERE DisplayName = '([^']*)'/);
      if (cust) {
        const hits = this.customers.filter((c) => c.DisplayName === cust[1]).map((c) => ({ ...c, SyncToken: '0' }));
        return Promise.resolve(hits.length ? { Customer: hits } : {});
      }
      return Promise.resolve({});
    }
    post(path: string, body: unknown) {
      const b = body as Record<string, unknown>;
      this.posts.push({ path, body: b });
      if (path === '/customer') {
        if (this.customers.some((c) => c.DisplayName === b.DisplayName)) return Promise.reject(new Error('QBO 400: Duplicate Name Exists Error'));
        const c = { Id: `C${this.posts.length}`, DisplayName: String(b.DisplayName) };
        this.customers.push(c);
        return Promise.resolve({ Customer: { ...c, SyncToken: '0' } });
      }
      if (path === '/item') {
        const it = { Id: `I${++this.created}`, Name: String(b.Name), Sku: String(b.Sku) };
        this.items.push(it);
        return Promise.resolve({ Item: { ...it, SyncToken: '0' } });
      }
      const amounts = (b.Line as Array<{ Amount: number }>).reduce((a, l) => a + l.Amount, 0);
      return Promise.resolve({ Estimate: { Id: 'E1', SyncToken: '0', DocNumber: '1001', TotalAmt: Math.round(amounts * 105) / 100 + this.totalSkew } });
    }
  }

  // qbo_entity_map CHECK constraints (migration 20260506215345, confirmed in production): anything else is rejected.
  const ENTITY_TYPES = ['customer', 'sub_customer', 'estimate', 'invoice', 'payment', 'item', 'purchase_order'];
  const REF_TYPES = ['submission', 'line_item', 'submission_payment', 'material_color', 'supplier'];
  const check = (t: string, r: string) => {
    if (!ENTITY_TYPES.includes(t) || !REF_TYPES.includes(r)) throw new Error(`violates qbo_entity_map check: ${t}/${r}`);
  };
  const deps = (lines: QuoteLine[], fake: FakeQbo, logs: Array<Record<string, unknown>> = [], map = new Map<string, MapRow>()) => {
    let qboCalls = 0;
    const d: SyncDeps & { qboCalls: () => number } = {
      loadSubmission: (id) => Promise.resolve({ id, email: 'b@x.test', first_name: 'B', last_name: 'X', unit_number: '24' }),
      loadSettings: () => Promise.resolve({ default_income_account_ref: '79', default_tax_code_ref: '5' }),
      loadLines: () => Promise.resolve({ lines, linesSource: 'db', gstRate: 0.05, pricingUnavailable: null }),
      qbo: () => { qboCalls++; return Promise.resolve(fake); },
      getMap: (t, r, id) => { try { check(t, r); } catch (e) { return Promise.reject(e); } return Promise.resolve(map.get(`${t}|${r}|${id}`) ?? null); },
      setMap: (t, r, id, qbo_id, qbo_sync_token) => {
        try { check(t, r); } catch (e) { return Promise.reject(e); }
        map.set(`${t}|${r}|${id}`, { qbo_id, qbo_sync_token }); return Promise.resolve();
      },
      log: (row) => { logs.push(row); return Promise.resolve(); },
      qboCalls: () => qboCalls,
    };
    return d;
  };
  const auto = { user_id: null, email: 'system@auto-sync', source: 'auto' as const };

  denoTest('pending line: 409 with line ids, QuickBooks never contacted', async () => {
    const fake = new FakeQbo();
    const logs: Array<Record<string, unknown>> = [];
    const d = deps([line({ id: 'a' }), line({ id: 'p', status: 'pending', amount: null })], fake, logs);
    const r = await handleQboSync({ submission_id: 's1' }, auto, d);
    eq(r, { status: 409, body: { error: 'quote has unpriced lines', lineIds: ['p'] } });
    ok(d.qboCalls() === 0 && fake.posts.length === 0, 'QBO must not be called');
    ok(logs[0]?.status === 'skipped', 'refusal is logged as skipped');
  });

  denoTest('nothing priced: 409, QuickBooks never contacted', async () => {
    const fake = new FakeQbo();
    const d = deps([line({ status: 'included', amount: 0 })], fake);
    ok((await handleQboSync({ submission_id: 's1' }, auto, d)).status === 409, 'expected 409');
    ok(d.qboCalls() === 0, 'QBO must not be called');
  });

  denoTest('items: found by Sku reused, missing created once as NonInventory with Name = Sku', async () => {
    const fake = new FakeQbo();
    fake.items.push({ Id: 'I-existing', Name: 'Legacy name', Sku: 'GLEN-STAIRS-lvp-with-custom-stair-nosings' });
    const lines = [
      line({ id: 'c1', material_key: 'carpet', amount: 1200.5 }),
      line({ id: 'c2', material_key: 'carpet', location: 'Primary Bedroom', amount: 300 }),
      line({ id: 's1', section: 'stairs', label: 'LVP with Custom Stair Nosings', amount: 2250, internal_note: 'INTERNAL-ONLY' }),
      line({ id: 'w1', section: 'window_coverings', label: 'Roller shade', quantity: 2, unit: 'each', amount: 1347 }),
      line({ id: 'i1', status: 'included', amount: 0, label: 'Standard LVP' }),
      line({ id: 'd1', status: 'deferred', amount: null, label: 'Basement' }),
    ];
    const r = await handleQboSync({ submission_id: 's1' }, auto, deps(lines, fake));
    ok(r.status === 200, JSON.stringify(r));
    const created = fake.posts.filter((p) => p.path === '/item').map((p) => p.body);
    eq(created.map((b) => [b.Name, b.Sku, b.Type]), [
      ['GLEN-FLOORING-carpet', 'GLEN-FLOORING-carpet', 'NonInventory'],
      ['GLEN-WINDOW_COVERINGS-roller-shade', 'GLEN-WINDOW_COVERINGS-roller-shade', 'NonInventory'],
    ]);
    ok(fake.queries.filter((s) => s.includes("Sku = 'GLEN-FLOORING-carpet'")).length === 1, 'SKU looked up once per request');
    const est = fake.posts.find((p) => p.path === '/estimate')!.body;
    const L = est.Line as Array<{ Amount: number; Description: string; SalesItemLineDetail: { ItemRef: { value: string }; Qty: number; UnitPrice: number; TaxCodeRef?: { value: string } } }>;
    eq(L.map((l) => l.Amount), [1200.5, 300, 2250, 1347]);
    eq(L.map((l) => l.SalesItemLineDetail.ItemRef.value), ['I1', 'I1', 'I-existing', 'I2']);
    eq([L[3].SalesItemLineDetail.Qty, L[3].SalesItemLineDetail.UnitPrice], [2, 673.5]);
    ok(L.every((l) => l.SalesItemLineDetail.TaxCodeRef?.value === '5') && est.GlobalTaxCalculation === 'TaxExcluded', 'GST via TaxCodeRef');
    ok(L.every((l) => !l.Description.includes('INTERNAL-ONLY')), 'no internal text');
    ok(r.body.expected_total === 5352.38 && r.body.total_mismatch === false, JSON.stringify(r.body));
  });

  denoTest('auto-create off and Item missing: 500 with a clear message', async () => {
    const d = deps([line({ material_key: 'carpet' })], new FakeQbo());
    d.loadSettings = () => Promise.resolve({ default_income_account_ref: '79', auto_create_items: false });
    const quiet = console.error; console.error = () => {};
    const r = await handleQboSync({ submission_id: 's1' }, auto, d).finally(() => { console.error = quiet; });
    ok(r.status === 500 && String(r.body.error).includes('GLEN-FLOORING-carpet'), JSON.stringify(r));
  });

  const quiet = async <T>(f: () => Promise<T>) => {
    const e = console.error; const w = console.warn; console.error = () => {}; console.warn = () => {};
    try { return await f(); } finally { console.error = e; console.warn = w; }
  };

  denoTest('map rows use only the CHECK-allowed keys; a second sync updates the same Estimate', async () => {
    const fake = new FakeQbo();
    const map = new Map<string, MapRow>();
    const lines = [line({ id: 'c1', material_key: 'carpet', amount: 100 })];
    ok((await handleQboSync({ submission_id: 's1' }, auto, deps(lines, fake, [], map))).status === 200, 'first sync');
    eq([...map.keys()].sort(), ['customer|submission|s1', 'estimate|submission|s1', 'item|line_item|GLEN-FLOORING-carpet', 'sub_customer|submission|s1']);
    const r2 = await handleQboSync({ submission_id: 's1' }, auto, deps(lines, fake, [], map));
    ok(r2.status === 200, JSON.stringify(r2));
    const ests = fake.posts.filter((p) => p.path === '/estimate');
    ok(ests.length === 2 && ests[1].body.Id === 'E1' && fake.posts.filter((p) => p.path === '/customer').length === 2, 'update, no new customers');
  });

  denoTest('existing "Unit N" Job under the parent (no map row) is reused, not re-created', async () => {
    const fake = new FakeQbo();
    fake.customers.push({ Id: 'C-buyer', DisplayName: 'X, B' });
    fake.customers.push({ Id: 'C-job', DisplayName: 'Unit 24', Job: true, ParentRef: { value: 'C-buyer' } });
    const r = await handleQboSync({ submission_id: 's1' }, auto, deps([line({ material_key: 'carpet' })], fake));
    ok(r.status === 200 && r.body.customer_id === 'C-buyer' && r.body.project_id === 'C-job', JSON.stringify(r));
    ok(fake.posts.filter((p) => p.path === '/customer').length === 0, 'no customer/job created');
  });

  denoTest('a map write error fails the sync (500), never silently', async () => {
    const d = deps([line({ material_key: 'carpet' })], new FakeQbo());
    d.setMap = () => Promise.reject(new Error('qbo_entity_map write failed (customer/submission): boom'));
    const r = await quiet(() => handleQboSync({ submission_id: 's1' }, auto, d));
    ok(r.status === 500 && String(r.body.error).includes('qbo_entity_map write failed'), JSON.stringify(r));
  });

  denoTest('QBO TotalAmt off by $0.01 → total_mismatch: true', async () => {
    const fake = new FakeQbo();
    fake.totalSkew = 0.01;
    const r = await quiet(() => handleQboSync({ submission_id: 's1' }, auto, deps([line({ material_key: 'carpet', amount: 100 })], fake)));
    ok(r.status === 200 && r.body.total_mismatch === true && r.body.amount_sum_mismatch === false, JSON.stringify(r.body));
  });

  denoTest('sub-cent line amounts → amount_sum_mismatch: true (Σ 24.70 vs subtotal 24.69)', async () => {
    const logs: Array<Record<string, unknown>> = [];
    const lines = [line({ id: 'a', material_key: 'carpet', amount: 12.345 }), line({ id: 'b', material_key: 'carpet', amount: 12.345 })];
    const r = await quiet(() => handleQboSync({ submission_id: 's1' }, auto, deps(lines, new FakeQbo(), logs)));
    ok(r.status === 200 && r.body.amount_sum_mismatch === true, JSON.stringify(r.body));
    const payload = logs.find((l) => l.status === 'success')?.response_payload as Record<string, unknown>;
    ok(payload?.amount_sum_mismatch === true && payload?.amount_sum === 24.7, JSON.stringify(payload));
  });
}
