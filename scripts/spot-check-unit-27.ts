// Spot-check: for each unit-27 buyer_selections row, list every populated
// comment field and confirm whether the PDF generators would render it.
//
// Source of truth:
//  - Buyer PDF (src/lib/buyerPdfGenerator.ts) renders these fields in the
//    "Your Comments & Notes" section: lvp, spcTile, window, backsplashGrout,
//    upgradeInterestsNotes, upgradeComments, AND area_upgrades[].comments.
//    It intentionally OMITS sales_comments (internal admin notes per policy).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://adtbjnwaxmxhyjkjxqoz.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("buyer_selections")
  .select(
    "id, unit_number, first_name, last_name, status, created_at, lvp_comments, spc_tile_comments, window_comments, backsplash_grout_comments, sales_comments, upgrade_comments, upgrade_interests_notes, area_upgrades"
  )
  .eq("unit_number", "27")
  .order("created_at", { ascending: false });

if (error) {
  console.error(error);
  process.exit(1);
}

const TOP_FIELDS: Array<{ key: string; buyer: boolean; admin: boolean; label: string }> = [
  { key: "lvp_comments", buyer: true, admin: true, label: "Main Floor LVP" },
  { key: "spc_tile_comments", buyer: true, admin: true, label: "Bathroom Tile" },
  { key: "window_comments", buyer: true, admin: true, label: "Window Coverings" },
  { key: "backsplash_grout_comments", buyer: true, admin: true, label: "Backsplash Grout" },
  { key: "upgrade_interests_notes", buyer: true, admin: true, label: "Upgrade Interests" },
  { key: "upgrade_comments", buyer: true, admin: true, label: "Upgrade Pricing Summary" },
  { key: "sales_comments", buyer: false, admin: true, label: "Sales / Admin Notes" },
];

let warnings = 0;
for (const row of data ?? []) {
  console.log("\n────────────────────────────────────────────");
  console.log(`Unit ${row.unit_number} · ${row.first_name} ${row.last_name} · ${row.id}`);
  console.log(`Submitted: ${row.created_at} · Status: ${row.status}`);

  for (const f of TOP_FIELDS) {
    const v = (row as any)[f.key];
    if (v && String(v).trim()) {
      const buyerMark = f.buyer ? "📄 buyer" : "—       ";
      const adminMark = f.admin ? "🛠 admin" : "—       ";
      console.log(`  ✓ ${f.label.padEnd(26)} ${buyerMark} ${adminMark}  "${String(v).slice(0, 80)}"`);
    }
  }

  const upgrades = Array.isArray(row.area_upgrades) ? row.area_upgrades : [];
  upgrades.forEach((u: any, idx: number) => {
    const c = typeof u?.comments === "string" ? u.comments.trim() : "";
    if (!c) return;
    const area = u.areaId || `(unspecified #${idx + 1})`;
    console.log(`  ✓ Area Upgrade [${area}]      📄 buyer 🛠 admin  "${c.slice(0, 80)}"`);
  });

  // Sanity: warn if any well-known unknown areaId
  upgrades.forEach((u: any) => {
    if (u?.areaId && !["mainLiving","secondBedroom","masterBedroom","masterBedroomLvp","secondBedroomCarpet","masterBedroomCarpet","stairs","guestBathroom","masterEnsuite","laundry","backsplash","allLvp"].includes(u.areaId)) {
      if (!String(u.areaId).startsWith("unspecified_area")) {
        warnings++;
        console.log(`  ⚠ Unknown areaId "${u.areaId}" — will fall back to raw key in PDF`);
      }
    }
  });
}

console.log("\n────────────────────────────────────────────");
console.log(warnings === 0 ? "✅ All area IDs are recognized." : `⚠ ${warnings} unknown area IDs found.`);
