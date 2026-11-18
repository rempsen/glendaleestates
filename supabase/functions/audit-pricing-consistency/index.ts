// =====================================================================
// Pricing-consistency auditor
//
// For each submission (or a single one when ?submissionId=... is passed):
//   1. Compute canonical totals via the SHARED computeUpgradeTotalsServer().
//   2. Render the buyer email preview HTML through resend-confirmation-email
//      (preview mode) — same builder used for the real outbound email.
//   3. Scrape every "$X,XXX.XX" amount out of that HTML.
//   4. Confirm: canonical grand total appears, canonical subtotal appears,
//      canonical GST appears, AND every shared lineItem.amount appears.
//   5. Flag any submission where preview HTML totals diverge from the
//      shared pricing engine.
//
// Returns: { audited, mismatches: [{ submissionId, unitNumber, expected, found, missing }] }
//
// mode 'lines' (POST body { mode: 'lines', submissionId? }, Phase 2 spec §6.4): per submission, the same
// canonical engine totals ↔ SUM(amount) WHERE counts_in_total and the window-coverings sum from quote_lines.
// Returns { mode, audited, okCount, failCount, noLinesCount, errorCount, rows: [{ submission_id, unit_number,
// engine_subtotal, lines_subtotal, diff, windows_diff, line_count, status: 'ok' | 'FAIL' | 'no lines' }], errors }.
// =====================================================================
import { getCorsHeaders } from "../_shared/cors.ts";
import { authorizeInternalOrAdmin, makeGetUserFromJwt } from "../_shared/internalAuth.ts";
import {
  computeUpgradeTotalsServer,
  normalizeUnitTypeCode,
  ServerAreaUpgrade,
  ServerPricing,
} from "../_shared/upgradeTotalsServer.ts";
import { loadServerPricing, restPricingFetcher } from "../_shared/loadServerPricing.ts";
import { compareEngineToLines } from "../_shared/compareEngineToLines.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function fetchPricing(): Promise<ServerPricing> {
  return await loadServerPricing(restPricingFetcher(SUPABASE_URL, SERVICE_KEY));
}

async function fetchPreviewHtml(submissionId: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/resend-confirmation-email`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ submissionId, preview: true, previewType: 'buyer' }),
  });
  if (!r.ok) throw new Error(`preview fetch failed: ${await r.text()}`);
  const j = await r.json();
  return String(j.html || '');
}

// Extract every "$1234.56" / "$1,234.56" amount as a numeric set.
function extractAmounts(html: string): Set<number> {
  const out = new Set<number>();
  const rx = /\$\s?([\d,]+\.\d{2})/g;
  let m;
  while ((m = rx.exec(html))) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.add(Number(n.toFixed(2)));
  }
  return out;
}

function approxIn(set: Set<number>, value: number): boolean {
  const target = Number(value.toFixed(2));
  if (set.has(target)) return true;
  // tolerate 1¢ rounding drift
  for (const v of set) if (Math.abs(v - target) <= 0.01) return true;
  return false;
}

// Raw buyer_selections row → canonical server totals (one mapping for every mode).
// deno-lint-ignore no-explicit-any
function canonicalTotals(sub: any, pricing: ServerPricing) {
  return computeUpgradeTotalsServer({
    unitTypeCode: sub.unit_type ? normalizeUnitTypeCode(sub.unit_type) : null,
    upgradeFloorSelection: sub.upgrade_floor_selection,
    areaUpgrades: (sub.area_upgrades as ServerAreaUpgrade[]) || [],
    backsplashGroutEnabled: sub.backsplash_grout_enabled,
    backsplashGroutColor: sub.backsplash_grout_color,
    stairLvpUpgradeSelected: sub.stair_lvp_upgrade_selected,
    stairPremiumCarpetSelected: sub.stair_premium_carpet_selected, stairPremiumUnderpadSelected: sub.premium_underpad_stairs,
    stairUpgradeType: sub.stair_upgrade_type,
    additionalWindowsQty: sub.additional_windows_qty,
    patioDoorsQty: sub.patio_doors_qty,
    automatedWindowsQty: sub.automated_windows_qty,
    bathroomTileSelected: sub.bathroom_tile_selected,
    bathroomTileEnsuiteSelected: sub.bathroom_tile_ensuite_selected,
    bathroomTileGuestSelected: sub.bathroom_tile_guest_selected,
    heatedFloorBathrooms: sub.heated_floor_bathrooms,
    customTiledShower: sub.custom_tiled_shower,
    bedroomFlooringChoice: sub.bedroom_flooring_choice,
    bedroomPremiumCarpetSelected: !!sub.premium_carpet_bedroom,
    bedroomPremiumUnderpadSelected: !!sub.premium_underpad_bedroom,
    customPricing: sub.custom_pricing,
  }, pricing);
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LinesRow {
  submission_id: string;
  unit_number: string;
  engine_subtotal: number;
  lines_subtotal: number;
  diff: number;
  windows_diff: number;
  line_count: number;
  status: "ok" | "FAIL" | "no lines";
}

// mode 'lines': canonical engine totals ↔ stored quote_lines (service-role REST, read only).
async function linesMode(submissionId: string | null, cors: Record<string, string>): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", ...cors } });
  if (submissionId != null && !UUID_RX.test(submissionId)) return json({ error: "submissionId must be a uuid" }, 400);

  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const filter = submissionId ? `id=eq.${submissionId}` : "order=unit_number.asc";
  const sRes = await fetch(`${SUPABASE_URL}/rest/v1/buyer_selections?${filter}`, { headers });
  if (!sRes.ok) throw new Error(`failed to fetch submissions: ${await sRes.text()}`);
  const subs = await sRes.json();
  const pricing = await fetchPricing();

  const rows: LinesRow[] = [];
  const errors: { submissionId: string; error: string }[] = [];
  for (const sub of subs) {
    try {
      const totals = canonicalTotals(sub, pricing);
      const lRes = await fetch(
        `${SUPABASE_URL}/rest/v1/quote_lines?submission_id=eq.${sub.id}&select=section,status,amount`,
        { headers },
      );
      if (!lRes.ok) throw new Error(`failed to fetch quote_lines: ${await lRes.text()}`);
      const c = compareEngineToLines(totals, await lRes.json());
      rows.push({
        submission_id: sub.id,
        unit_number: sub.unit_number,
        engine_subtotal: c.engine_subtotal,
        lines_subtotal: c.lines_subtotal,
        diff: c.diff,
        windows_diff: c.windows_diff,
        line_count: c.line_count,
        status: c.line_count === 0 ? "no lines" : c.ok ? "ok" : "FAIL",
      });
    } catch (e) {
      errors.push({ submissionId: sub.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const count = (st: LinesRow["status"]) => rows.filter((r) => r.status === st).length;
  return json({
    mode: "lines",
    audited: subs.length,
    okCount: count("ok"),
    failCount: count("FAIL"),
    noLinesCount: count("no lines"),
    errorCount: errors.length,
    rows,
    errors,
  });
}

interface MismatchReport {
  submissionId: string;
  unitNumber: string;
  buyer: string;
  expected: { subtotal: number; gst: number; grandTotal: number };
  missing: string[];
  foundAmounts: number[];
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const gate = await authorizeInternalOrAdmin(
    req,
    { serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") },
    makeGetUserFromJwt(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
  );
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...cors },
    });
  }

  try {
    // deno-lint-ignore no-explicit-any
    let body: any = null;
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = null; }
    }
    if (body && body.mode === "lines") {
      return await linesMode(typeof body.submissionId === "string" ? body.submissionId : null, cors);
    }

    const url = new URL(req.url);
    const oneId = url.searchParams.get('submissionId');
    const limit = Math.min(Number(url.searchParams.get('limit') || '500'), 1000);

    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
    const filter = oneId ? `id=eq.${oneId}` : `order=created_at.desc&limit=${limit}`;
    const sRes = await fetch(`${SUPABASE_URL}/rest/v1/buyer_selections?${filter}`, { headers });
    if (!sRes.ok) throw new Error(`failed to fetch submissions: ${await sRes.text()}`);
    const subs = await sRes.json();

    const pricing = await fetchPricing();

    const mismatches: MismatchReport[] = [];
    const ok: string[] = [];
    const errors: { submissionId: string; error: string }[] = [];

    for (const sub of subs) {
      try {
        const totals = canonicalTotals(sub, pricing);

        // Submissions with no priced upgrades — skip silently.
        if (totals.grandSubtotal <= 0) { ok.push(sub.id); continue; }

        const html = await fetchPreviewHtml(sub.id);
        const amounts = extractAmounts(html);

        const missing: string[] = [];
        if (!approxIn(amounts, totals.grandSubtotal)) missing.push(`subtotal $${totals.grandSubtotal.toFixed(2)}`);
        if (!approxIn(amounts, totals.gst)) missing.push(`GST $${totals.gst.toFixed(2)}`);
        if (!approxIn(amounts, totals.grandTotal)) missing.push(`grandTotal $${totals.grandTotal.toFixed(2)}`);
        for (const li of totals.lineItems) {
          if (li.amount > 0 && !approxIn(amounts, li.amount)) {
            missing.push(`line "${li.label}" $${li.amount.toFixed(2)}`);
          }
        }

        if (missing.length) {
          mismatches.push({
            submissionId: sub.id,
            unitNumber: sub.unit_number,
            buyer: `${sub.first_name || ''} ${sub.last_name || ''}`.trim(),
            expected: {
              subtotal: Number(totals.grandSubtotal.toFixed(2)),
              gst: Number(totals.gst.toFixed(2)),
              grandTotal: Number(totals.grandTotal.toFixed(2)),
            },
            missing,
            foundAmounts: [...amounts].sort((a, b) => b - a).slice(0, 20),
          });
        } else {
          ok.push(sub.id);
        }
      } catch (e) {
        errors.push({ submissionId: sub.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({
      audited: subs.length,
      okCount: ok.length,
      mismatchCount: mismatches.length,
      errorCount: errors.length,
      mismatches,
      errors,
    }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors },
    });
  } catch (error) {
    console.error("audit-pricing-consistency error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json", ...cors } });
  }
});
