// Single loader for the edge engine's ServerPricing (pricing_config / upgrade_materials / unit_area_data).
// Dependency-free: callers pass a row fetcher (REST via fetch, or a supabase-js service-role client), so it
// runs under Deno and bun tests alike. pricing_config stores percentages as whole numbers (markup_percentage = 60,
// gst_rate = 5); the engine wants fractions (0.6, 0.05), so both are divided by 100 here and nowhere else.
import type { ServerPricing } from "./upgradeTotalsServer.ts";

export type PricingTable = "pricing_config" | "upgrade_materials" | "unit_area_data";
// deno-lint-ignore no-explicit-any
export type PricingRowFetcher = (table: PricingTable) => Promise<any[] | null | undefined>;

const DEFAULT_MARKUP = 0.6;
const DEFAULT_GST = 0.05;

// deno-lint-ignore no-explicit-any
export function serverPricingFromRows(rows: { pricing_config?: any[] | null; upgrade_materials?: any[] | null; unit_area_data?: any[] | null }): ServerPricing {
  const materials: Record<string, number> = {};
  const config: Record<string, number> = {};
  const unitAreas: ServerPricing["unitAreas"] = {};
  let markupPercentage = DEFAULT_MARKUP;
  let gstRate = DEFAULT_GST;
  // Inactive rows never price anything, whichever fetcher (or browser hook) supplied them. Rows fetched without the
  // column (narrow selects that already filtered server-side) count as active.
  const active = (r: { is_active?: unknown }) => r && r.is_active !== false;
  for (const m of (rows.upgrade_materials ?? []).filter(active)) materials[m.material_key] = Number(m.cost_per_unit);
  for (const c of (rows.pricing_config ?? []).filter(active)) {
    config[c.config_key] = Number(c.config_value);
    if (c.config_key === "markup_percentage") markupPercentage = Number(c.config_value) / 100;
    if (c.config_key === "gst_rate") gstRate = Number(c.config_value) / 100;
  }
  const n = (v: unknown) => Number(v || 0);
  for (const u of rows.unit_area_data ?? []) {
    unitAreas[u.unit_type_code] = {
      allLvp: n(u.all_lvp), mainLiving: n(u.main_living),
      secondBedroom: n(u.second_bedroom), masterBedroomLvp: n(u.master_bedroom_lvp),
      masterBedroom: n(u.master_bedroom), secondBedroomCarpet: n(u.second_bedroom_carpet),
      guestBathroom: n(u.guest_bathroom), masterEnsuite: n(u.master_ensuite),
      laundry: n(u.laundry), backsplash: n(u.backsplash),
    };
  }
  return { materials, config, unitAreas, markupPercentage, gstRate };
}

/**
 * Why a loaded ServerPricing cannot price a permanent record, or null when it can. restPricingFetcher turns a non-OK
 * response into [] (so emails keep their historical fallbacks), which leaves a table empty; pricing_config,
 * upgrade_materials and unit_area_data are never legitimately empty, so an empty one means the fetch failed.
 */
export function pricingUnavailableReason(p: ServerPricing): string | null {
  const empty: string[] = [];
  if (Object.keys(p.config).length === 0) empty.push("pricing_config");
  if (Object.keys(p.materials).length === 0) empty.push("upgrade_materials");
  if (Object.keys(p.unitAreas).length === 0) empty.push("unit_area_data");
  return empty.length ? `empty ${empty.join(", ")}` : null;
}

export async function loadServerPricing(fetchRows: PricingRowFetcher): Promise<ServerPricing> {
  const [pricing_config, upgrade_materials, unit_area_data] = await Promise.all([
    fetchRows("pricing_config"), fetchRows("upgrade_materials"), fetchRows("unit_area_data"),
  ]);
  return serverPricingFromRows({ pricing_config, upgrade_materials, unit_area_data });
}

/** PostgREST fetcher with the service-role key (the query shape the email/audit functions used). */
export function restPricingFetcher(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): PricingRowFetcher {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const path: Record<PricingTable, string> = {
    upgrade_materials: "upgrade_materials?is_active=eq.true",
    pricing_config: "pricing_config?is_active=eq.true",
    unit_area_data: "unit_area_data",
  };
  return async (table) => {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path[table]}`, { headers });
    return res.ok ? await res.json() : [];
  };
}

/** supabase-js service-role client fetcher (the query shape qbo-sync-submission / sync-hubspot used). */
// deno-lint-ignore no-explicit-any
export function clientPricingFetcher(admin: any): PricingRowFetcher {
  return async (table) => {
    if (table === "pricing_config") return (await admin.from(table).select("config_key, config_value, is_percentage").eq("is_active", true)).data;
    if (table === "upgrade_materials") return (await admin.from(table).select("material_key, cost_per_unit").eq("is_active", true)).data;
    return (await admin.from(table).select("*")).data;
  };
}
