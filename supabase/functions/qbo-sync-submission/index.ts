// Pushes a buyer_selections submission into QuickBooks Online as:
//   Customer (buyer)  →  Sub-customer/Project (unit)  →  Estimate (line items)
// Auto-creates Items per upgrade line. Idempotent via qbo_entity_map.
//
// Caller: admin-only (UI button) OR self-invoked from auto-sync trigger.
// Self-invocations include header `x-internal-secret = SUPABASE_SERVICE_ROLE_KEY`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  ensureFreshToken, getActiveConnection, qboFetch, qboQuery,
  type QboConnection,
} from '../_shared/qboClient.ts';
import {
  computeUpgradeTotalsServer,
  normalizeUnitTypeCode,
  type ServerLineItem,
  type ServerTotalsResult,
} from '../_shared/upgradeTotalsServer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

interface QboSettings {
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

const DEFAULT_SETTINGS: QboSettings = {
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

// ---------- helpers ----------

function fmtTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function slugify(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function lineItemSku(prefix: string, line: ServerLineItem): string {
  return `${prefix}${slugify(line.group)}-${slugify(line.label)}`;
}

async function getMap(
  admin: any, entity_type: string, portal_ref_type: string, portal_ref_id: string,
): Promise<{ qbo_id: string; qbo_sync_token: string | null } | null> {
  const { data } = await admin
    .from('qbo_entity_map')
    .select('qbo_id, qbo_sync_token')
    .eq('entity_type', entity_type)
    .eq('portal_ref_type', portal_ref_type)
    .eq('portal_ref_id', portal_ref_id)
    .maybeSingle();
  return data ?? null;
}

async function setMap(
  admin: any, entity_type: string, portal_ref_type: string, portal_ref_id: string,
  qbo_id: string, qbo_sync_token: string | null, metadata: Record<string, unknown> = {},
) {
  await admin.from('qbo_entity_map').upsert({
    entity_type, portal_ref_type, portal_ref_id, qbo_id, qbo_sync_token,
    metadata, last_synced_at: new Date().toISOString(),
  }, { onConflict: 'entity_type,portal_ref_type,portal_ref_id' });
}

async function logSync(admin: any, row: Record<string, unknown>) {
  try { await admin.from('qbo_sync_log').insert(row); } catch (e) { console.warn('log fail', e); }
}

// ---------- entity upserts ----------

async function upsertCustomer(
  admin: any, conn: QboConnection, settings: QboSettings, submission: any,
): Promise<string> {
  const portalKey = (submission.email || '').toLowerCase();
  const existing = await getMap(admin, 'customer', 'buyer_email', portalKey);
  const displayName = fmtTemplate(settings.customer_name_template, {
    first_name: submission.first_name || '',
    last_name: submission.last_name || '',
    email: submission.email || '',
  }).trim() || submission.email;

  if (existing) {
    return existing.qbo_id;
  }

  // Try to find by display name first (case where customer was created in QBO already)
  const safeName = displayName.replace(/'/g, "\\'");
  const found = await qboQuery(conn, `SELECT Id, DisplayName, SyncToken FROM Customer WHERE DisplayName = '${safeName}' MAXRESULTS 1`);
  if (found.Customer?.[0]) {
    const c = found.Customer[0];
    await setMap(admin, 'customer', 'buyer_email', portalKey, c.Id, c.SyncToken);
    return c.Id;
  }

  const body = {
    DisplayName: displayName,
    GivenName: submission.first_name || undefined,
    FamilyName: submission.last_name || undefined,
    PrimaryEmailAddr: submission.email ? { Address: submission.email } : undefined,
    PrimaryPhone: submission.phone_number ? { FreeFormNumber: submission.phone_number } : undefined,
  };
  const res = await qboFetch(conn, '/customer', { method: 'POST', body: JSON.stringify(body) });
  const created = res.Customer;
  await setMap(admin, 'customer', 'buyer_email', portalKey, created.Id, created.SyncToken);
  return created.Id;
}

async function upsertProject(
  admin: any, conn: QboConnection, settings: QboSettings,
  parentCustomerId: string, submission: any,
): Promise<string> {
  const portalKey = submission.id; // submission UUID = unit/project
  const existing = await getMap(admin, 'project', 'submission_id', portalKey);
  if (existing) return existing.qbo_id;

  const projectName = fmtTemplate(settings.project_name_template, {
    unit_number: submission.unit_number || '',
    unit_type: submission.unit_type || '',
    first_name: submission.first_name || '',
    last_name: submission.last_name || '',
  }).trim() || `Unit ${submission.unit_number}`;

  // QBO sub-customers are created as Customers with Job=true and ParentRef.
  const body = {
    DisplayName: projectName,
    Job: true,
    ParentRef: { value: parentCustomerId },
    BillWithParent: true,
  };
  const res = await qboFetch(conn, '/customer', { method: 'POST', body: JSON.stringify(body) });
  const created = res.Customer;
  await setMap(admin, 'project', 'submission_id', portalKey, created.Id, created.SyncToken);
  return created.Id;
}

async function upsertItem(
  admin: any, conn: QboConnection, settings: QboSettings, line: ServerLineItem,
): Promise<{ id: string; name: string }> {
  const sku = lineItemSku(settings.item_sku_prefix, line);
  const existing = await getMap(admin, 'item', 'item_sku', sku);
  if (existing) return { id: existing.qbo_id, name: line.label };

  // Search QBO by SKU
  const safeSku = sku.replace(/'/g, "\\'");
  const found = await qboQuery(conn, `SELECT Id, Name, Sku, SyncToken FROM Item WHERE Sku = '${safeSku}' MAXRESULTS 1`);
  if (found.Item?.[0]) {
    const it = found.Item[0];
    await setMap(admin, 'item', 'item_sku', sku, it.Id, it.SyncToken);
    return { id: it.Id, name: it.Name };
  }

  if (!settings.auto_create_items) {
    throw new Error(`No QBO Item found for SKU ${sku} and auto-create is disabled.`);
  }
  if (!settings.default_income_account_ref) {
    throw new Error('Default income account is not configured in QuickBooks Settings.');
  }

  const body = {
    Name: line.label.slice(0, 100),
    Sku: sku,
    Type: 'Service',
    IncomeAccountRef: { value: settings.default_income_account_ref },
    Taxable: true,
  };
  const res = await qboFetch(conn, '/item', { method: 'POST', body: JSON.stringify(body) });
  const created = res.Item;
  await setMap(admin, 'item', 'item_sku', sku, created.Id, created.SyncToken, { group: line.group });
  return { id: created.Id, name: created.Name };
}

async function buildEstimateBody(
  admin: any, conn: QboConnection, settings: QboSettings,
  projectQboId: string, submission: any, totals: ServerTotalsResult,
) {
  const lines = [];
  for (const li of totals.lineItems) {
    if (!li.amount || li.amount <= 0) continue;
    const item = await upsertItem(admin, conn, settings, li);
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: Number(li.amount.toFixed(2)),
      Description: li.detail ? `${li.label} — ${li.detail}` : li.label,
      SalesItemLineDetail: {
        ItemRef: { value: item.id, name: item.name },
        Qty: 1,
        UnitPrice: Number(li.amount.toFixed(2)),
        TaxCodeRef: settings.default_tax_code_ref ? { value: settings.default_tax_code_ref } : undefined,
      },
    });
  }

  if (lines.length === 0) {
    throw new Error('No priced upgrade lines on this submission — nothing to send to QuickBooks.');
  }

  return {
    CustomerRef: { value: projectQboId },
    TxnDate: new Date().toISOString().slice(0, 10),
    Line: lines,
    PrivateNote: `Glendale Portal submission ${submission.id} (Unit ${submission.unit_number})`,
    CustomerMemo: { value: 'Itemized buyer upgrades. See attached selections summary.' },
    GlobalTaxCalculation: 'TaxExcluded',
  };
}

async function upsertEstimate(
  admin: any, conn: QboConnection, settings: QboSettings,
  projectQboId: string, submission: any, totals: ServerTotalsResult,
): Promise<{ qboId: string; docNumber: string | null }> {
  const body = await buildEstimateBody(admin, conn, settings, projectQboId, submission, totals);
  const existing = await getMap(admin, 'estimate', 'submission_id', submission.id);

  let res: any;
  if (existing) {
    // Update — must include Id and SyncToken with sparse=true preserved fields
    const updateBody = { ...body, Id: existing.qbo_id, SyncToken: existing.qbo_sync_token ?? '0', sparse: false };
    res = await qboFetch(conn, '/estimate', { method: 'POST', body: JSON.stringify(updateBody) });
  } else {
    res = await qboFetch(conn, '/estimate', { method: 'POST', body: JSON.stringify(body) });
  }
  const created = res.Estimate;
  await setMap(admin, 'estimate', 'submission_id', submission.id, created.Id, created.SyncToken, {
    doc_number: created.DocNumber, total: created.TotalAmt,
  });
  return { qboId: created.Id, docNumber: created.DocNumber ?? null };
}

// ---------- totals from submission ----------

async function computeTotalsForSubmission(admin: any, submission: any): Promise<ServerTotalsResult> {
  // Pull pricing config + materials + unit areas the same way the email/PDF does.
  const [pcRes, umRes, uaRes] = await Promise.all([
    admin.from('pricing_config').select('config_key, config_value, is_percentage').eq('is_active', true),
    admin.from('upgrade_materials').select('material_key, cost_per_unit').eq('is_active', true),
    admin.from('unit_area_data').select('*'),
  ]);

  const config: Record<string, number> = {};
  let markupPercentage = 0;
  let gstRate = 0.05;
  for (const r of (pcRes.data ?? [])) {
    config[r.config_key] = Number(r.config_value);
    if (r.config_key === 'markup_percentage') markupPercentage = Number(r.config_value);
    if (r.config_key === 'gst_rate') gstRate = Number(r.config_value);
  }
  const materials: Record<string, number> = {};
  for (const r of (umRes.data ?? [])) materials[r.material_key] = Number(r.cost_per_unit);

  const unitAreas: Record<string, any> = {};
  for (const r of (uaRes.data ?? [])) {
    unitAreas[r.unit_type_code] = {
      allLvp: Number(r.all_lvp), mainLiving: Number(r.main_living),
      secondBedroom: Number(r.second_bedroom), masterBedroomLvp: Number(r.master_bedroom_lvp),
      masterBedroom: Number(r.master_bedroom), secondBedroomCarpet: Number(r.second_bedroom_carpet),
      guestBathroom: Number(r.guest_bathroom), masterEnsuite: Number(r.master_ensuite),
      laundry: Number(r.laundry), backsplash: Number(r.backsplash),
    };
  }

  const code = normalizeUnitTypeCode(submission.unit_type);
  return computeUpgradeTotalsServer({
    selection: submission,
    pricing: { materials, config, unitAreas, markupPercentage, gstRate },
    unitTypeCode: code,
  });
}

// ---------- main ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let triggeredBy = { user_id: null as string | null, email: null as string | null, source: 'manual' };

  try {
    // Allow internal calls from the DB trigger (service-role secret) OR admin user JWT.
    const internalSecret = req.headers.get('x-internal-secret');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (internalSecret && internalSecret === serviceKey) {
      triggeredBy = { user_id: null, email: 'system@auto-sync', source: 'auto' };
    } else {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: ud } = await supabase.auth.getUser();
      if (!ud?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roleRow } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', ud.user.id).eq('role', 'admin').maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      triggeredBy = { user_id: ud.user.id, email: ud.user.email ?? null, source: 'manual' };
    }

    const body = await req.json().catch(() => ({}));
    const submissionId: string = body.submission_id;
    if (!submissionId) {
      return new Response(JSON.stringify({ error: 'submission_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: submission, error: subErr } = await admin
      .from('buyer_selections').select('*').eq('id', submissionId).maybeSingle();
    if (subErr || !submission) throw new Error('Submission not found');

    // Load settings (single row)
    const { data: settingsRow } = await admin.from('qbo_settings').select('*').limit(1).maybeSingle();
    const settings: QboSettings = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) };

    let conn = await getActiveConnection(admin);
    conn = await ensureFreshToken(admin, conn);

    const totals = await computeTotalsForSubmission(admin, submission);

    const customerId = await upsertCustomer(admin, conn, settings, submission);
    const projectId = await upsertProject(admin, conn, settings, customerId, submission);
    const estimate = await upsertEstimate(admin, conn, settings, projectId, submission, totals);

    await logSync(admin, {
      direction: 'outbound', operation: 'sync_submission', status: 'success',
      entity_type: 'estimate', portal_ref_type: 'submission_id', portal_ref_id: submissionId,
      qbo_id: estimate.qboId,
      triggered_by_user_id: triggeredBy.user_id, triggered_by_email: triggeredBy.email,
      response_payload: { customer_id: customerId, project_id: projectId, doc_number: estimate.docNumber, source: triggeredBy.source },
    });

    return new Response(JSON.stringify({
      success: true, customer_id: customerId, project_id: projectId,
      estimate_id: estimate.qboId, doc_number: estimate.docNumber,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('qbo-sync-submission error:', msg);
    await logSync(admin, {
      direction: 'outbound', operation: 'sync_submission', status: 'error',
      error_message: msg.slice(0, 1000),
      triggered_by_user_id: triggeredBy.user_id, triggered_by_email: triggeredBy.email,
      response_payload: { source: triggeredBy.source },
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
