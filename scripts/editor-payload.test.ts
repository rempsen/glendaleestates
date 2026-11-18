import { test, expect } from 'bun:test';
import { buildSubmissionUpdatePayload, type SubmissionEditState } from '../src/lib/submissionUpdatePayload';

const base = (over: Partial<SubmissionEditState> = {}): SubmissionEditState => ({
  id: 'x', created_at: '', updated_at: '', unit_number: '37', unit_type: 'C',
  first_name: 'A', last_name: 'B', phone_number: null, email: 'a@b.c',
  estimated_possession_date: null, has_stairs: false,
  lvp_colour: null, lvp_comments: null, spc_tile_colour: null, spc_tile_comments: null,
  backsplash_orientation: null, stair_carpet_colour: null,
  bedroom_flooring_choice: null, bedroom_carpet_colour: null, bedroom_lvp_colour: null,
  bedroom_lvp_same_as_main: false, additional_windows_qty: 0, patio_doors_qty: 0,
  window_total: 0, upgrade_interests: {}, status: 'submitted', sales_comments: null,
  ...over,
});

test('heated_floor_bathrooms is passed through, not derived from area rows (Unit 37)', () => {
  const p = buildSubmissionUpdatePayload(base({
    heated_floor_bathrooms: 2,
    area_upgrades: [{ areaId: 'a', materialType: 'tile', productName: '', productColor: '', comments: '' }],
  }));
  expect(p.heated_floor_bathrooms).toBe(2);
});

test('area_upgrades rows retain areaLabel and other extra keys', () => {
  const p = buildSubmissionUpdatePayload(base({
    area_upgrades: [{
      areaId: 'masterEnsuite', materialType: 'tile', productName: 'P', productColor: 'C', comments: '',
      areaLabel: 'Master Ensuite (incl. walk-in closet)', manualPrice: 0, heatedFloor: undefined,
    } as any],
  }));
  const rows = p.area_upgrades as any[];
  expect(rows[0].areaLabel).toBe('Master Ensuite (incl. walk-in closet)');
  expect(rows[0].manualPrice).toBeNull();
  expect(rows[0].heatedFloor).toBe(false);
  expect(rows[0].manualPriceNote).toBe('');
});

test('has_stairs false forces stair upgrade flags off', () => {
  const p = buildSubmissionUpdatePayload(base({
    has_stairs: false, stair_premium_carpet_selected: true, premium_underpad_stairs: true,
    stair_lvp_upgrade_selected: true,
  }));
  expect(p.stair_premium_carpet_selected).toBe(false);
  expect(p.premium_underpad_stairs).toBe(false);
  expect(p.stair_lvp_upgrade_selected).toBe(false);
  expect(p.stair_upgrade_type).toBe('standard');
});

test('payload includes the six Task 6 fields from editData', () => {
  const p = buildSubmissionUpdatePayload(base({
    automated_windows_qty: 3,
    custom_tiled_shower: true,
    bathroom_tile_ensuite_selected: true,
    bathroom_tile_guest_selected: false,
    admin_notes: 'call buyer',
    heated_floor_bathrooms: 1,
  }));
  expect(p.automated_windows_qty).toBe(3);
  expect(p.custom_tiled_shower).toBe(true);
  expect(p.bathroom_tile_ensuite_selected).toBe(true);
  expect(p.bathroom_tile_guest_selected).toBe(false);
  expect(p.admin_notes).toBe('call buyer');
});

test('heated_floor_bathrooms = max(input, count of heated area rows)', () => {
  const row = (heatedFloor: boolean) => ({ areaId: 'a', materialType: 'tile', productName: '', productColor: '', comments: '', heatedFloor });
  expect(buildSubmissionUpdatePayload(base({
    heated_floor_bathrooms: 1, area_upgrades: [row(true), row(true)],
  })).heated_floor_bathrooms).toBe(2);
  expect(buildSubmissionUpdatePayload(base({
    heated_floor_bathrooms: 3, area_upgrades: [row(false), row(false)],
  })).heated_floor_bathrooms).toBe(3);
  expect(buildSubmissionUpdatePayload(base({})).heated_floor_bathrooms).toBe(0);
});

test('heated count ignores non-tile rows (stale heatedFloor on LVP)', () => {
  const r = (materialType: string) => ({ areaId: 'a', materialType, productName: '', productColor: '', comments: '', heatedFloor: true });
  const p = buildSubmissionUpdatePayload(base({
    heated_floor_bathrooms: 0, area_upgrades: [r('nonstandard_lvp'), r('tile')],
  }));
  expect(p.heated_floor_bathrooms).toBe(1);
});
