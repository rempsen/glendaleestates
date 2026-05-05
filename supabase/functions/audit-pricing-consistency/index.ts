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
// =====================================================================
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  computeUpgradeTotalsServer,
  normalizeUnitTypeCode,
  ServerAreaUpgrade,
  ServerPricing,
} from "../_shared/upgradeTotalsServer.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function fetchPricing(): Promise<ServerPricing> {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const [mRes, cRes, uRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/upgrade_materials?is_active=eq.true`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/pricing_config`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/unit_area_data`, { headers }),
  ]);
  const materials: Record<string, number> = {};
  const config: Record<string, number> = {};
  const unitAreas: Record<string, any> = {};
  let markupPercentage = 0.6, gstRate = 0.05;
  if (mRes.ok) for (const m of await mRes.json()) materials[m.material_key] = Number(m.cost_per_unit);
  if (cRes.ok) for (const c of await cRes.json()) {
    config[c.config_key] = Number(c.config_value);
    if (c.config_key === 'markup_percentage') markupPercentage = Number(c.config_value) / 100;
    if (c.config_key === 'gst_rate') gstRate = Number(c.config_value) / 100;
  }
  if (uRes.ok) for (const u of await uRes.json()) unitAreas[u.unit_type_code] = {
    allLvp: Number(u.all_lvp), mainLiving: Number(u.main_living),
    secondBedroom: Number(u.second_bedroom),
    masterBedroomLvp: Number(u.master_bedroom_lvp || 0),
    masterBedroom: Number(u.master_bedroom),
    secondBedroomCarpet: Number(u.second_bedroom_carpet),
    guestBathroom: Number(u.guest_bathroom), masterEnsuite: Number(u.master_ensuite),
    laundry: Number(u.laundry), backsplash: Number(u.backsplash),
  };
  return { materials, config, unitAreas, markupPercentage, gstRate };
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

  try {
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
        const totals = computeUpgradeTotalsServer({
          unitTypeCode: sub.unit_type ? normalizeUnitTypeCode(sub.unit_type) : null,
          upgradeFloorSelection: sub.upgrade_floor_selection,
          areaUpgrades: (sub.area_upgrades as ServerAreaUpgrade[]) || [],
          backsplashGroutEnabled: sub.backsplash_grout_enabled,
          backsplashGroutColor: sub.backsplash_grout_color,
          stairLvpUpgradeSelected: sub.stair_lvp_upgrade_selected,
          stairPremiumCarpetSelected: sub.premium_underpad_stairs,
          stairUpgradeType: sub.stair_upgrade_type,
          additionalWindowsQty: sub.additional_windows_qty,
          patioDoorsQty: sub.patio_doors_qty,
          automatedWindowsQty: sub.automated_windows_qty,
          bathroomTileSelected: sub.bathroom_tile_selected,
          bathroomTileEnsuiteSelected: sub.bathroom_tile_ensuite_selected,
          bathroomTileGuestSelected: sub.bathroom_tile_guest_selected,
          heatedFloorBathrooms: sub.heated_floor_bathrooms,
          customTiledShower: sub.custom_tiled_shower,
        }, pricing);

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
