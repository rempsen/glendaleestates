/**
 * Backfill repair script
 * --------------------------------------------------------------
 * Scans every record in `buyer_selection_drafts` and copies any
 * comment-bearing fields into the matching `buyer_selections`
 * row when the column there is null/empty.
 *
 * Fields covered:
 *   - lvpComments              -> lvp_comments
 *   - spcTileComments          -> spc_tile_comments
 *   - windowComments           -> window_comments
 *   - backsplashGrout.comments -> backsplash_grout_comments
 *   - salesComments            -> sales_comments
 *   - upgradeComments          -> upgrade_comments
 *   - upgradeInterestsNotes    -> upgrade_interests_notes
 *   - areaUpgrades[].comments  -> merged into area_upgrades JSON
 *
 * Drafts are matched to submissions by `unit_number`. Where a
 * unit has multiple submissions, the most recent submission wins.
 *
 * Usage (from repo root, with PG* env vars set):
 *   bun run scripts/backfill-submission-comments.ts          # dry run
 *   bun run scripts/backfill-submission-comments.ts --apply  # write
 *
 * The script is idempotent — running it twice is safe.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

type SubmissionRow = {
  id: string;
  unit_number: string;
  created_at: string;
  lvp_comments: string | null;
  spc_tile_comments: string | null;
  window_comments: string | null;
  backsplash_grout_comments: string | null;
  sales_comments: string | null;
  upgrade_comments: string | null;
  upgrade_interests_notes: string | null;
  area_upgrades: Array<{ key?: string; comments?: string }> | null;
};

const nz = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

async function run() {
  console.log(`\n=== Backfill ${APPLY ? "(APPLY)" : "(dry-run)"} ===\n`);

  const { data: drafts, error: dErr } = await sb
    .from("buyer_selection_drafts")
    .select("unit_number, selections, updated_at");
  if (dErr) throw dErr;

  const { data: submissions, error: sErr } = await sb
    .from("buyer_selections")
    .select(
      "id, unit_number, created_at, lvp_comments, spc_tile_comments, window_comments, backsplash_grout_comments, sales_comments, upgrade_comments, upgrade_interests_notes, area_upgrades",
    )
    .order("created_at", { ascending: false });
  if (sErr) throw sErr;

  // Most recent submission per unit
  const subByUnit = new Map<string, SubmissionRow>();
  for (const s of (submissions ?? []) as SubmissionRow[]) {
    if (!subByUnit.has(s.unit_number)) subByUnit.set(s.unit_number, s);
  }

  // Most recent draft per unit
  const draftByUnit = new Map<string, any>();
  for (const d of drafts ?? []) {
    const prev = draftByUnit.get(d.unit_number);
    if (!prev || new Date(d.updated_at) > new Date(prev.updated_at)) {
      draftByUnit.set(d.unit_number, d);
    }
  }

  let inspected = 0;
  let updated = 0;
  const log: string[] = [];

  for (const [unit, draft] of draftByUnit) {
    const sub = subByUnit.get(unit);
    if (!sub) continue;
    inspected++;
    const sel = draft.selections ?? {};
    const patch: Record<string, unknown> = {};

    const candidates: Array<[keyof SubmissionRow, string | null]> = [
      ["lvp_comments", nz(sel.lvpComments)],
      ["spc_tile_comments", nz(sel.spcTileComments)],
      ["window_comments", nz(sel.windowComments)],
      ["backsplash_grout_comments", nz(sel.backsplashGrout?.comments)],
      ["sales_comments", nz(sel.salesComments)],
      ["upgrade_comments", nz(sel.upgradeComments)],
      ["upgrade_interests_notes", nz(sel.upgradeInterestsNotes)],
    ];

    for (const [col, val] of candidates) {
      if (val && !nz(sub[col] as string | null)) patch[col] = val;
    }

    // Merge area-upgrade comments
    if (Array.isArray(sel.areaUpgrades) && Array.isArray(sub.area_upgrades)) {
      const draftMap = new Map<string, string>();
      for (const a of sel.areaUpgrades) {
        const c = nz(a?.comments);
        if (a?.key && c) draftMap.set(a.key, c);
      }
      let changed = false;
      const merged = sub.area_upgrades.map((a) => {
        const draftC = a?.key ? draftMap.get(a.key) : null;
        if (draftC && !nz(a?.comments)) {
          changed = true;
          return { ...a, comments: draftC };
        }
        return a;
      });
      if (changed) patch.area_upgrades = merged;
    }

    if (Object.keys(patch).length === 0) continue;

    log.push(
      `Unit ${unit} (sub ${sub.id.slice(0, 8)}): ${Object.keys(patch).join(", ")}`,
    );
    updated++;

    if (APPLY) {
      const { error } = await sb
        .from("buyer_selections")
        .update(patch)
        .eq("id", sub.id);
      if (error) console.error(`  -> failed: ${error.message}`);
    }
  }

  console.log(log.join("\n"));
  console.log(
    `\nInspected ${inspected} units · ${updated} ${APPLY ? "updated" : "would be updated"}.\n`,
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
