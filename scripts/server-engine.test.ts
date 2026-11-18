import { test, expect } from 'bun:test';
import { computeUpgradeTotalsServer, type ServerPricing, type ServerTotalsInput } from '../supabase/functions/_shared/upgradeTotalsServer';
import { computeUpgradeTotals, type UpgradeTotalsInput, type UpgradeTotalsPricing } from '../src/lib/upgradeTotals';

const areas = { masterBedroom: 44, secondBedroomCarpet: 24 };
const sPricing: ServerPricing = {
  materials: { carpet: 25, premium_carpet_underpad: 6 },
  config: { premium_carpet_stairs_price: 640, stair_lvp_upgrade_price: 2160, premium_underpad_stairs_price: 0 },
  unitAreas: { C: areas },
  markupPercentage: 0.6,
  gstRate: 0.05,
};
const cPricing: UpgradeTotalsPricing = {
  markupPercentage: 0.6,
  gstRate: 0.05,
  getMaterialCost: k => (sPricing.materials as Record<string, number>)[k] || 0,
  getGroutColorFee: () => 300,
  getAdditionalWindowPrice: () => 673.5,
  getPatioDoorPrice: () => 2347.8,
  getAutomatedMotorPrice: () => 495,
  getHeatedFloorPrice: () => 1650,
  getStairLvpUpgradePrice: () => 2160,
  getStairPremiumLvpUpgradePrice: () => 3145,
  getStairCarpetUpgradePrice: () => 640,
  getStairUnderpadUpgradePrice: () => 0,
  getUnitAreaData: () => areas,
};

const server = (i: Partial<ServerTotalsInput>) => computeUpgradeTotalsServer({ unitTypeCode: 'C', areaUpgrades: [], ...i } as ServerTotalsInput, sPricing);
const client = (i: Partial<UpgradeTotalsInput>) => computeUpgradeTotals({ unitTypeCode: 'C', areaUpgrades: [], ...i } as UpgradeTotalsInput, cPricing);

test('server stairCarpet override 700 and 0', () => {
  const o = (amount: number) => ({ overrides: { stairCarpet: { amount } } });
  expect(server({ stairPremiumCarpetSelected: true, customPricing: o(700) }).pieces.stairCarpet).toBe(700);
  expect(server({ stairPremiumCarpetSelected: true, customPricing: o(0) }).pieces.stairCarpet).toBe(0);
});

test('stair override of 0 with carpet selected: LVP still wins (server matches client)', () => {
  const input = { stairUpgradeType: 'lvp' as const, stairPremiumCarpetSelected: true, customPricing: { overrides: { stair: { amount: 0 } } } };
  expect(server(input).pieces.stairCarpet).toBe(0);
  expect(client(input).pieces.stairCarpet).toBe(0);
  expect(server(input).grandSubtotal).toBeCloseTo(client(input).grandSubtotal, 2);
});

const cases: Array<[string, any]> = [
  ['both bedrooms carpet, underpad', { bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true }],
  ['second bedroom hard', { bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true, areaUpgrades: [{ areaId: 'secondBedroom', materialType: 'nonstandard_lvp' }] }],
  ['premium carpet', { bedroomFlooringChoice: 'carpet', bedroomPremiumCarpetSelected: true }],
  ['lvp choice', { bedroomFlooringChoice: 'lvp', bedroomPremiumCarpetSelected: true, bedroomPremiumUnderpadSelected: true }],
  ['underpad override 400', { bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true, customPricing: { overrides: { bedroomUnderpad: { amount: 400 } } } }],
];
for (const [name, input] of cases) {
  test(`server equals client: ${name}`, () => {
    const s = server(input), c = client(input);
    expect(s.grandSubtotal).toBeCloseTo(c.grandSubtotal, 2);
    expect(s.pieces.bedroomUnderpad).toBeCloseTo(c.pieces.bedroomUnderpad, 2);
    expect(s.pieces.bedroomCarpet).toBeCloseTo(c.pieces.bedroomCarpet, 2);
  });
}

test('server split-floor G/H read bedroom sq yd from the -2 row regardless of upgrade floor', () => {
  const gh: ServerPricing = { ...sPricing, unitAreas: { 'G-1': { masterBedroom: 0 }, 'G-2': { masterBedroom: 120, secondBedroomCarpet: 0 } } as any };
  for (const floor of ['1', '2', null] as const) {
    const t = computeUpgradeTotalsServer({
      unitTypeCode: 'G', upgradeFloorSelection: floor, areaUpgrades: [],
      bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true,
    } as ServerTotalsInput, gh);
    expect(t.pieces.bedroomUnderpad).toBeCloseTo(1152, 2);
  }
});

test('server bedroomUnderpad override of 0 yields 0 and no line item', () => {
  const t = server({ bedroomFlooringChoice: 'carpet', bedroomPremiumUnderpadSelected: true, customPricing: { overrides: { bedroomUnderpad: { amount: 0 } } } });
  expect(t.pieces.bedroomUnderpad).toBe(0);
  expect(t.lineItems.some(l => l.label.includes('Underpad'))).toBe(false);
});
