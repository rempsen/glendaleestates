/**
 * Client-comment backfill (Task 7) - CODE ONLY, NEVER WRITES.
 * ------------------------------------------------------------------
 * Before 2026-11-16 the wizard was the only writer of area_upgrades[].comments,
 * so those texts are buyer-typed. From 2026-11-16 staff typed internal remarks
 * into the same field. This script prints the SQL that copies `comments` ->
 * `clientComment` for area rows of submissions created BEFORE the cutoff,
 * lists what it will NOT migrate, and proves pricing is unchanged.
 *
 * NOT evaluable here: the audit-log rule ("no admin edit of area_upgrades in
 * submission_audit_logs"). The fixture has no audit data, so the controller
 * must check the printed submission ids against submission_audit_logs before
 * running the SQL.
 *
 * Usage: bun run scripts/backfill-client-comments.ts [path/to/submissions.json]
 *        (defaults to scripts/fixtures/live-submissions.json)
 */
import { readFileSync } from 'node:fs';
import { computeUpgradeTotals } from '../src/lib/upgradeTotals';
import { totalsInputFromSelections } from '../src/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '../src/lib/upgradeCostData';

export const CUTOFF = '2026-11-16';

type Area = Record<string, unknown>;
export interface SubmissionRow { id: string; unit_number?: string; created_at: string; area_upgrades?: unknown; [k: string]: unknown }
export interface Update { id: string; unit: string; before: Area[]; after: Area[]; migrated: number }
export interface Skipped { id: string; unit: string; areaId: string; index: number; reason: string }

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Pure per-row transform. Copies only `comments` -> `clientComment`; every other key (pricing included) is untouched. */
export function migrateAreaRow(row: Area): { row: Area; migrated: boolean } {
  if (row.clientComment !== undefined) return { row, migrated: false }; // already handled: idempotent
  if (!text(row.comments)) return { row, migrated: false };
  return { row: { ...row, clientComment: row.comments }, migrated: true };
}

export function planBackfill(submissions: SubmissionRow[], cutoff = CUTOFF) {
  const updates: Update[] = [];
  const skipped: Skipped[] = [];
  for (const s of submissions) {
    const areas: Area[] = Array.isArray(s.area_upgrades) ? (s.area_upgrades as Area[]) : [];
    const unit = String(s.unit_number ?? '');
    const eligible = s.created_at.slice(0, 10) < cutoff;
    let migrated = 0;
    const after = areas.map((a, index) => {
      const areaId = String(a.areaId ?? '');
      if (!eligible) {
        if (text(a.comments)) skipped.push({ id: s.id, unit, areaId, index, reason: `submission created on/after ${cutoff}` });
        return a;
      }
      const r = migrateAreaRow(a);
      if (r.migrated) migrated++;
      else if (a.clientComment !== undefined) skipped.push({ id: s.id, unit, areaId, index, reason: 'already has clientComment' });
      else skipped.push({ id: s.id, unit, areaId, index, reason: 'empty comments' });
      return r.row;
    });
    if (migrated > 0) updates.push({ id: s.id, unit, before: areas, after, migrated });
  }
  return { updates, skipped };
}

const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/** Guarded on the old value, so re-running or racing an admin edit is a no-op. */
export function toSql(u: Update): string {
  return `UPDATE buyer_selections SET area_upgrades = ${lit(u.after)} WHERE id = '${u.id.replace(/'/g, "''")}' AND area_upgrades = ${lit(u.before)};`;
}

if (import.meta.main) {
  const path = process.argv[2] ?? new URL('./fixtures/live-submissions.json', import.meta.url).pathname;
  // Input is either a bare array of submissions or { submissions: [...], drafts?: [...] }.
  const input = JSON.parse(readFileSync(path, 'utf8')) as SubmissionRow[] | { submissions: SubmissionRow[]; drafts?: unknown[] };
  const rows = Array.isArray(input) ? input : input.submissions;
  const drafts = Array.isArray(input) ? undefined : input.drafts;
  const { updates, skipped } = planBackfill(rows);

  console.log(`-- (a) SQL: ${updates.length} submission(s), ${updates.reduce((n, u) => n + u.migrated, 0)} area row(s). Cutoff created_at < '${CUTOFF}'.`);
  console.log('-- Controller: confirm these ids have NO admin edit of area_upgrades in submission_audit_logs before running.');
  console.log(`-- Submission ids: ${updates.map(u => `${u.id} (unit ${u.unit})`).join(', ') || '(none)'}`);
  console.log('BEGIN;');
  updates.forEach(u => console.log(toSql(u)));
  console.log('COMMIT;\n');

  console.log(`-- (b) NOT migrated: ${skipped.length} area row(s)`);
  skipped.forEach(k => console.log(`--   unit ${k.unit} ${k.id} area[${k.index}] ${k.areaId}: ${k.reason}`));
  const late = rows.filter(r => r.created_at.slice(0, 10) >= CUTOFF).map(r => `${r.id} (unit ${r.unit_number})`);
  console.log(drafts
    ? `--   NOTE: ${drafts.length} wizard draft(s) in the input (buyer_selection_drafts.selections) may still hold buyer text in areaUpgrades[].comments; they are NOT migrated by this SQL.`
    : '--   NOTE: wizard drafts (buyer_selection_drafts.selections) created before deploy may still hold buyer text in areaUpgrades[].comments; no drafts array in the input, so they are not counted or migrated.');
  console.log(`--   submissions on/after ${CUTOFF}: ${late.join(', ') || '(none)'}\n`);

  console.log('-- (c) Parity check (comments do not price)');
  const { default: pricingSnapshot } = await import('./fixtures/pricing-snapshot.json');
  const { loadFixturePricing } = await import('./lib/fixturePricing');
  const pricing = loadFixturePricing(pricingSnapshot as never);
  const totalFor = (r: SubmissionRow) => {
    const unitCode = r.unit_type ? normalizeUnitTypeCode(String(r.unit_type)) : null;
    return computeUpgradeTotals(totalsInputFromSelections(toBuyerPdfSelections(r as never), unitCode), pricing).grandTotal;
  };
  const byId = new Map(updates.map(u => [u.id, u]));
  let bad = 0;
  for (const r of rows) {
    const u = byId.get(r.id);
    const before = totalFor(r);
    const after = totalFor(u ? { ...r, area_upgrades: u.after } : r);
    const ok = before === after;
    if (!ok) bad++;
    console.log(`--   unit ${r.unit_number}: before ${before.toFixed(2)} after ${after.toFixed(2)} ${ok ? 'OK' : 'MISMATCH'}`);
  }
  console.log(bad === 0 ? '-- PARITY OK: all totals unchanged' : `-- PARITY FAILED: ${bad} mismatch(es)`);
  process.exit(bad === 0 ? 0 : 1);
}
