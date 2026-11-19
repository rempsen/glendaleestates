// Office prices (custom_pricing overrides, manual area prices, custom items) on the quote-line generator.
// Rules and figures carried over from the Phase 1 engine tests (Unit 31 $27,098; stairs $840 + $165).
import { test, expect } from 'bun:test';
import { generateQuoteLines, sumQuoteLines, type GenerateInput, type QuotePricing } from '../supabase/functions/_shared/quoteLines';

const pricing: QuotePricing = {
  materials: { tiled_shower: 3000, tile: 10, lvp: 5, carpet: 5 },
  config: {
    grout_color_change_price: 300, additional_window_price: 673.5, patio_door_price: 2347.8, automated_motor_price: 495,
    heated_floor_per_bathroom: 1650, stair_lvp_upgrade_price: 2160, premium_carpet_stairs_price: 840, premium_underpad_stairs_price: 165,
  },
  unitAreas: { E: { allLvp: 800, guestBathroom: 50, masterEnsuite: 60 } }, markupPercentage: 0.6, gstRate: 0.05,
};
type Sel = GenerateInput['selections'];
const run = (sel: Partial<Sel>) => {
  const lines = generateQuoteLines({ selections: { areaUpgrades: [], bedroomFlooringChoice: '', ...sel } as Sel, unitTypeCode: 'E', pricing, baseSpec: [] });
  return { lines, t: sumQuoteLines(lines, pricing.gstRate) };
};
const field = (lines: ReturnType<typeof run>['lines'], f: string) => lines.filter((l) => l.wizard_field === f);

const unit31: Partial<Sel> = {
  areaUpgrades: [
    { areaId: 'allLvp', materialType: 'lvp', manualPrice: 10120 },
    { areaId: 'guestBathroom', materialType: 'tile', manualPrice: 1796 },
    { areaId: 'masterEnsuite', materialType: 'tile', manualPrice: 1932, heatedFloor: true },
  ] as never,
  backsplashGrout: { enabled: true, groutColor: 'black', comments: '' },
  bathroomTileSelected: true, heatedFloorBathrooms: 1, customTiledShower: true,
  customPricing: { overrides: { heatedFloor: { amount: 2450 }, customShower: { amount: 9400 }, grout: { amount: 1400 } } },
};

test('Unit 31 office prices give a $27,098 subtotal before GST', () => {
  expect(run(unit31).t.subtotal).toBeCloseTo(27098, 2);
});
test('GST of 5% is added on top of office prices', () => {
  const { t } = run(unit31);
  expect(t.gst).toBeCloseTo(1354.9, 2);
  expect(t.total).toBeCloseTo(28452.9, 2);
});
test('custom line items use quantity x unit price and add to the subtotal', () => {
  const { t } = run({ ...unit31, customPricing: { ...unit31.customPricing, customItems: [{ id: 'a', label: 'Closet tile', quantity: 20, unitPrice: 15 }] } });
  expect(t.subtotal).toBeCloseTo(27398, 2);
});
test('an override does not charge for an upgrade that is switched off', () => {
  expect(field(run({ ...unit31, customTiledShower: false }).lines, 'custom_tiled_shower')).toHaveLength(0);
});

const stairs: Partial<Sel> = { stairUpgradeType: 'standard', stairPremiumCarpetSelected: true, premiumUnderpadStairs: true };
test('premium carpet and underpad for stairs to lower level are both charged ($840 + $165)', () => {
  const { t } = run(stairs);
  expect(t.subtotal).toBeCloseTo(1005, 2);
  expect(t.total).toBeCloseTo(1055.25, 2);
});
test('stair carpet upgrades are not charged when stairs are upgraded to LVP', () => {
  const { lines } = run({ ...stairs, stairUpgradeType: 'lvp' });
  expect(field(lines, 'stair_premium_carpet_selected')).toHaveLength(0);
  expect(field(lines, 'premium_underpad_stairs')).toHaveLength(0);
});

test('office price on a Stairs row adds to the total (Unit 24: +$1,005)', () => {
  const base = run(unit31).t.subtotal;
  const withStair = run({ ...unit31, areaUpgrades: [...(unit31.areaUpgrades as never[]), { areaId: 'stairs', materialType: 'carpet', productName: '', productColor: '', manualPrice: 1005 }] as never }).t.subtotal;
  expect(withStair - base).toBeCloseTo(1005, 2);
});
test('Stairs row without office price adds nothing', () => {
  const base = run(unit31).t.subtotal;
  const t = run({ ...unit31, areaUpgrades: [...(unit31.areaUpgrades as never[]), { areaId: 'stairs', materialType: 'carpet', productName: '', productColor: '' }] as never }).t.subtotal;
  expect(t).toBeCloseTo(base, 2);
});

test('stairCarpet override replaces the $840 flat rate', () => {
  const [c] = field(run({ ...stairs, customPricing: { overrides: { stairCarpet: { amount: 700 } } } }).lines, 'stair_premium_carpet_selected');
  expect(c.amount).toBe(700);
});
test('stairCarpet override of 0 waives the line (included $0, not counted)', () => {
  const { lines, t } = run({ ...stairs, customPricing: { overrides: { stairCarpet: { amount: 0 } } } });
  expect(field(lines, 'stair_premium_carpet_selected')[0]).toMatchObject({ status: 'included', amount: 0 });
  expect(t.subtotal).toBeCloseTo(165, 2);
});
test('stairUnderpad override replaces the $165 flat rate', () => {
  const [u] = field(run({ ...stairs, customPricing: { overrides: { stairUnderpad: { amount: 100 } } } }).lines, 'premium_underpad_stairs');
  expect(u.amount).toBe(100);
});
