// qbo-sync-submission logic (Phase 2 Task 15, spec §6.11): the QBO Estimate is built 1:1 from the submission's
// quote_lines by _shared/qboLinesMap.ts — no engine call and no price arithmetic here. Refuses (409) before touching
// QuickBooks when a line is unpriced (pending / under_review / upgrade without an amount) or nothing is priced.
// Customer → Sub-customer/Project (unit) → Estimate, Items looked up by Sku and auto-created (NonInventory,
// Name = Sku) when `auto_create_items`. GST as before: TaxCodeRef per line (default_tax_code_ref) with
// GlobalTaxCalculation = TaxExcluded, so QBO adds the tax; the expected totals are returned and logged beside QBO's.
// Wired by ./index.ts; tested by ./handler.test.ts (Deno) with a fake QBO client.
import { estimateLinesFromQuoteLines, type QboEstimateLine } from '../_shared/qboLinesMap.ts';
import type { QuoteLine } from '../_shared/quoteLines.ts';

export interface QboSettings {
  default_income_account_ref: string | null;
  default_income_account_name: string | null;
  default_ar_account_ref: string | null;
  default_tax_code_ref: string | null;
  default_tax_code_name: string | null;
  item_sku_prefix: string;
  customer_name_template: string;
  project_name_template: string;
  auto_create_items: boolean;
}

export const DEFAULT_SETTINGS: QboSettings = {
  default_income_account_ref: null,
  default_income_account_name: null,
  default_ar_account_ref: null,
  default_tax_code_ref: null,
  default_tax_code_name: null,
  item_sku_prefix: 'GLEN-',
  customer_name_template: '{last_name}, {first_name}',
  project_name_template: 'Unit {unit_number}',
  auto_create_items: true,
};

export const NOTHING_PRICED = 'No priced upgrade lines on this submission — nothing to send to QuickBooks.';

/** The two QBO calls the sync needs (qboQuery / qboFetch POST in production). */
export interface QboApi {
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string): Promise<any>;
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post(path: string, body: unknown): Promise<any>;
}

export interface MapRow { qbo_id: string; qbo_sync_token: string | null }

export interface TriggeredBy { user_id: string | null; email: string | null; source: 'manual' | 'auto' }

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Submission = Record<string, any> & { id: string };

export interface SyncDeps {
  loadSubmission(id: string): Promise<Submission | null>;
  loadSettings(): Promise<Partial<QboSettings> | null>;
  /** Stored quote_lines, else the generator over the row (savedSubmissionLines); plus the GST rate. */
  loadLines(submission: Submission): Promise<{
    lines: QuoteLine[]; linesSource: 'db' | 'generated'; gstRate: number; pricingUnavailable: string | null;
  }>;
  /** Active connection with a fresh access token. Only called once the lines are known to be sendable. */
  qbo(): Promise<QboApi>;
  getMap(entityType: string, refType: string, refId: string): Promise<MapRow | null>;
  setMap(entityType: string, refType: string, refId: string, qboId: string, syncToken: string | null, metadata?: Record<string, unknown>): Promise<void>;
  log(row: Record<string, unknown>): Promise<void>;
}

export interface SyncResult { status: number; body: Record<string, unknown> }

const fmtTemplate = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function upsertCustomer(api: QboApi, deps: SyncDeps, settings: QboSettings, s: Submission): Promise<string> {
  const portalKey = String(s.email || '').toLowerCase();
  const existing = await deps.getMap('customer', 'buyer_email', portalKey);
  if (existing) return existing.qbo_id;
  const displayName = fmtTemplate(settings.customer_name_template, {
    first_name: s.first_name || '', last_name: s.last_name || '', email: s.email || '',
  }).trim() || s.email;
  const found = await api.query(`SELECT Id, DisplayName, SyncToken FROM Customer WHERE DisplayName = '${q(displayName)}' MAXRESULTS 1`);
  if (found?.Customer?.[0]) {
    const c = found.Customer[0];
    await deps.setMap('customer', 'buyer_email', portalKey, c.Id, c.SyncToken);
    return c.Id;
  }
  const res = await api.post('/customer', {
    DisplayName: displayName,
    GivenName: s.first_name || undefined,
    FamilyName: s.last_name || undefined,
    PrimaryEmailAddr: s.email ? { Address: s.email } : undefined,
    PrimaryPhone: s.phone_number ? { FreeFormNumber: s.phone_number } : undefined,
  });
  await deps.setMap('customer', 'buyer_email', portalKey, res.Customer.Id, res.Customer.SyncToken);
  return res.Customer.Id;
}

async function upsertProject(api: QboApi, deps: SyncDeps, settings: QboSettings, parentId: string, s: Submission): Promise<string> {
  const existing = await deps.getMap('project', 'submission_id', s.id);
  if (existing) return existing.qbo_id;
  const projectName = fmtTemplate(settings.project_name_template, {
    unit_number: s.unit_number || '', unit_type: s.unit_type || '', first_name: s.first_name || '', last_name: s.last_name || '',
  }).trim() || `Unit ${s.unit_number}`;
  // QBO sub-customers are Customers with Job=true and ParentRef.
  const res = await api.post('/customer', { DisplayName: projectName, Job: true, ParentRef: { value: parentId }, BillWithParent: true });
  await deps.setMap('project', 'submission_id', s.id, res.Customer.Id, res.Customer.SyncToken);
  return res.Customer.Id;
}

/**
 * Item for a SKU: entity map → QBO Item by Sku → by Name (= Sku) → create NonInventory (Name = Sku) when
 * auto_create_items. `cache` is per request, so a SKU shared by several lines is resolved once.
 */
export async function resolveItem(
  api: QboApi, deps: SyncDeps, settings: QboSettings, sku: string, cache: Map<string, Promise<string>>,
): Promise<string> {
  const hit = cache.get(sku);
  if (hit) return hit;
  const p = (async () => {
    const mapped = await deps.getMap('item', 'item_sku', sku);
    if (mapped) return mapped.qbo_id;
    for (const field of ['Sku', 'Name']) {
      const found = await api.query(`SELECT Id, Name, Sku, SyncToken FROM Item WHERE ${field} = '${q(sku)}' MAXRESULTS 1`);
      const it = found?.Item?.[0];
      if (it) { await deps.setMap('item', 'item_sku', sku, it.Id, it.SyncToken); return it.Id as string; }
    }
    if (!settings.auto_create_items) throw new Error(`No QBO Item found for SKU ${sku} and auto-create is disabled.`);
    if (!settings.default_income_account_ref) throw new Error('Default income account is not configured in QuickBooks Settings.');
    const res = await api.post('/item', {
      Name: sku.slice(0, 100), Sku: sku, Type: 'NonInventory',
      IncomeAccountRef: { value: settings.default_income_account_ref }, Taxable: true,
    });
    await deps.setMap('item', 'item_sku', sku, res.Item.Id, res.Item.SyncToken);
    return res.Item.Id as string;
  })();
  cache.set(sku, p);
  try { return await p; } catch (e) { cache.delete(sku); throw e; }
}

export function salesItemLine(l: QboEstimateLine, itemId: string, taxCodeRef: string | null) {
  return {
    DetailType: 'SalesItemLineDetail',
    Amount: l.Amount,
    Description: l.Description,
    SalesItemLineDetail: {
      ItemRef: { value: itemId, name: l.sku },
      Qty: l.Qty,
      UnitPrice: l.UnitPrice,
      TaxCodeRef: taxCodeRef ? { value: taxCodeRef } : undefined,
    },
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function handleQboSync(body: unknown, triggeredBy: TriggeredBy, deps: SyncDeps): Promise<SyncResult> {
  const submissionId = (body as { submission_id?: unknown } | null)?.submission_id;
  if (typeof submissionId !== 'string' || !submissionId) return { status: 400, body: { error: 'submission_id is required' } };
  const who = { triggered_by_user_id: triggeredBy.user_id, triggered_by_email: triggeredBy.email };
  const ref = { entity_type: 'estimate', portal_ref_type: 'submission_id', portal_ref_id: submissionId };
  const refuse = async (error: string, extra: Record<string, unknown> = {}): Promise<SyncResult> => {
    await deps.log({ direction: 'outbound', operation: 'sync_submission', status: 'skipped', ...ref, error_message: error, ...who,
      response_payload: { source: triggeredBy.source, ...extra } });
    return { status: 409, body: { error, ...extra } };
  };

  try {
    const submission = await deps.loadSubmission(submissionId);
    if (!submission) return { status: 404, body: { error: 'Submission not found' } };
    const settings: QboSettings = { ...DEFAULT_SETTINGS, ...(await deps.loadSettings() ?? {}) };

    const { lines, linesSource, gstRate, pricingUnavailable } = await deps.loadLines(submission);
    if (linesSource === 'generated' && pricingUnavailable) return await refuse(`pricing unavailable (${pricingUnavailable})`);
    const map = estimateLinesFromQuoteLines(lines, { gstRate, skuPrefix: settings.item_sku_prefix || 'GLEN-' });
    if (map.blocked) return await refuse(map.blocked.reason, { lineIds: map.blocked.lineIds });
    if (map.lines.length === 0) return await refuse(NOTHING_PRICED);

    const api = await deps.qbo();
    const customerId = await upsertCustomer(api, deps, settings, submission);
    const projectId = await upsertProject(api, deps, settings, customerId, submission);

    const cache = new Map<string, Promise<string>>();
    const Line = [];
    for (const l of map.lines) Line.push(salesItemLine(l, await resolveItem(api, deps, settings, l.sku, cache), settings.default_tax_code_ref));
    const estimateBody = {
      CustomerRef: { value: projectId },
      TxnDate: new Date().toISOString().slice(0, 10),
      Line,
      PrivateNote: `Glendale Portal submission ${submission.id} (Unit ${submission.unit_number})`,
      CustomerMemo: { value: 'Itemized buyer upgrades. See attached selections summary.' },
      GlobalTaxCalculation: 'TaxExcluded',
    };
    const existing = await deps.getMap('estimate', 'submission_id', submission.id);
    const res = await api.post('/estimate', existing
      ? { ...estimateBody, Id: existing.qbo_id, SyncToken: existing.qbo_sync_token ?? '0', sparse: false }
      : estimateBody);
    const est = res.Estimate;
    const expected = { subtotal: r2(map.subtotal), gst: r2(map.gst), total: r2(map.total) };
    const qboTotal = typeof est.TotalAmt === 'number' ? est.TotalAmt : null;
    const totalMismatch = qboTotal != null && Math.abs(qboTotal - expected.total) >= 0.005;
    if (totalMismatch) console.warn(`[qbo] estimate ${est.Id} TotalAmt ${qboTotal} ≠ quote total ${expected.total} (check the GST tax code)`);
    await deps.setMap('estimate', 'submission_id', submission.id, est.Id, est.SyncToken, {
      doc_number: est.DocNumber, total: est.TotalAmt, expected_total: expected.total, lines_source: linesSource,
    });
    await deps.log({
      direction: 'outbound', operation: 'sync_submission', status: 'success', ...ref, qbo_id: est.Id, ...who,
      response_payload: { customer_id: customerId, project_id: projectId, doc_number: est.DocNumber, source: triggeredBy.source,
        lines: Line.length, lines_source: linesSource, expected, qbo_total: qboTotal, total_mismatch: totalMismatch },
    });
    return { status: 200, body: {
      success: true, customer_id: customerId, project_id: projectId, estimate_id: est.Id, doc_number: est.DocNumber ?? null,
      expected_total: expected.total, qbo_total: qboTotal, total_mismatch: totalMismatch,
    } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('qbo-sync-submission error:', msg);
    await deps.log({ direction: 'outbound', operation: 'sync_submission', status: 'error', ...ref, error_message: msg.slice(0, 1000), ...who,
      response_payload: { source: triggeredBy.source } });
    return { status: 500, body: { error: msg } };
  }
}
