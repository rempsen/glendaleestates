import { test, expect } from 'bun:test';
import { migrateDraftClientComments, migrateDraftAreaRow } from '../src/lib/draftClientComments';

test('pre-split draft: comments moves to clientComment and comments is cleared', () => {
  const draft = { unitNumber: '7', areaUpgrades: [{ areaId: 'laundry', materialType: 'tile', comments: 'Matte grey please', manualPrice: 100 }] };
  const out = migrateDraftClientComments(draft);
  expect(out.areaUpgrades[0]).toEqual({ areaId: 'laundry', materialType: 'tile', clientComment: 'Matte grey please', comments: '', manualPrice: 100 });
  expect(draft.areaUpgrades[0].comments).toBe('Matte grey please'); // input not mutated
});
test('already-migrated row (clientComment defined) is left exactly as is', () => {
  const row = { areaId: 'laundry', clientComment: 'buyer', comments: 'something' };
  expect(migrateDraftAreaRow(row)).toBe(row);
  const draft = { areaUpgrades: [row] };
  expect(migrateDraftClientComments(draft)).toBe(draft);
});
test('empty / whitespace / missing comments are not migrated', () => {
  for (const comments of ['', '   ', undefined]) {
    const row = { areaId: 'x', comments };
    expect(migrateDraftAreaRow(row)).toBe(row);
  }
});
test('idempotent: running twice equals running once', () => {
  const draft = { areaUpgrades: [{ areaId: 'a', comments: 'note' }, { areaId: 'b', clientComment: '' }] };
  const once = migrateDraftClientComments(draft);
  expect(migrateDraftClientComments(once)).toBe(once);
  expect(once.areaUpgrades[1]).toEqual({ areaId: 'b', clientComment: '' });
});
test('draft without areaUpgrades passes through', () => {
  const d = { unitNumber: '1' } as { unitNumber: string; areaUpgrades?: unknown };
  expect(migrateDraftClientComments(d)).toBe(d);
});
