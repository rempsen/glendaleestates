import { test, expect } from 'bun:test';
import { migrateAreaRow, planBackfill, toSql } from './backfill-client-comments';

const row = { areaId: 'masterEnsuite', materialType: 'tile', productName: 'X', productColor: 'Y', comments: 'buyer text', heatedFloor: true, manualPrice: 8400, manualPriceNote: 'quoted' };

test('copies comments to clientComment and leaves every other key (pricing included) untouched', () => {
  const { row: out, migrated } = migrateAreaRow(row);
  expect(migrated).toBe(true);
  expect(out.clientComment).toBe('buyer text');
  const { clientComment, ...rest } = out;
  expect(rest).toEqual(row);
  expect(row).not.toHaveProperty('clientComment'); // input not mutated
});
test('idempotent: a row that already has clientComment is left alone, and a second pass changes nothing', () => {
  const had = { ...row, clientComment: 'staff-edited' };
  const r = migrateAreaRow(had);
  expect(r.migrated).toBe(false);
  expect(r.row).toBe(had);
  const once = migrateAreaRow(row).row;
  expect(migrateAreaRow(once)).toEqual({ row: once, migrated: false });
});
test('date rule: on/after 2026-11-16 and empty-comment rows are listed, not migrated', () => {
  const subs = [
    { id: 'old', unit_number: '1', created_at: '2026-11-15T23:59:59+00:00', area_upgrades: [row, { ...row, comments: '' }] },
    { id: 'new', unit_number: '2', created_at: '2026-11-16T00:00:00+00:00', area_upgrades: [row] },
  ];
  const { updates, skipped } = planBackfill(subs);
  expect(updates.map(u => u.id)).toEqual(['old']);
  expect(updates[0].after[0].clientComment).toBe('buyer text');
  expect(updates[0].after[1]).not.toHaveProperty('clientComment');
  expect(skipped.map(s => `${s.id}:${s.reason}`)).toEqual(['old:empty comments', 'new:submission created on/after 2026-11-16']);
  expect(planBackfill(updates.map(u => ({ id: u.id, created_at: '2026-01-01', area_upgrades: u.after }))).updates).toEqual([]); // re-run is a no-op
});
test('SQL is guarded on the old value and escapes quotes', () => {
  const { updates } = planBackfill([{ id: 'a', created_at: '2026-01-01', area_upgrades: [{ ...row, comments: "it's tile" }] }]);
  const sql = toSql(updates[0]);
  expect(sql).toContain("it''s tile");
  expect(sql).toMatch(/WHERE id = 'a' AND area_upgrades = /);
});
