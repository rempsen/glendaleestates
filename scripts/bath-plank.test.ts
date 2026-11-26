// Bathroom & laundry may take a standard main-floor plank at no cost (Dan, 2026-11-26). One shared choice
// (`spc_tile_colour`) covers every bathroom and the laundry.
import { test, expect } from 'bun:test';
import { generateQuoteLines, sumQuoteLines, type GenerateInput, type QuotePricing } from '../supabase/functions/_shared/quoteLines';
import { baseSpecFor } from '../src/lib/baseSpec';
import { laundryValue, LAUNDRY_STANDARD_LABEL, plankBathChoiceName } from '../src/lib/outputLabels';
import { bathLaundryFloorOptions, isPlankBathChoice, resolveOptionName } from '../src/lib/mockData';

const pricing: QuotePricing = {
  materials: {}, config: {}, unitAreas: { C: {} }, markupPercentage: 0.6, gstRate: 0.05,
};
type Sel = GenerateInput['selections'];
const spec = baseSpecFor('C').map((r) => ({
  section: r.section, location: r.location, label: r.label, defaultProduct: r.defaultProduct,
  defaultColourOptions: r.defaultColourOptions, isIncluded: r.isIncluded,
}));
const gen = (spcTileColour: string) => generateQuoteLines({
  selections: { areaUpgrades: [], bedroomFlooringChoice: '', spcTileColour } as Sel,
  unitTypeCode: 'C', pricing, baseSpec: spec as never,
});
const at = (lines: ReturnType<typeof gen>, location: string) => lines.find((l) => l.location === location)!;

test('wizard offers the three tiles then the three planks', () => {
  expect(bathLaundryFloorOptions.map((o) => o.id)).toEqual(
    ['pezzo', 'piccolo', 'venatino-auguste', 'cortland', 'opal', 'wolf-river']);
  expect(resolveOptionName(bathLaundryFloorOptions, 'wolf-river')).toBe('Wolf River');
  expect(isPlankBathChoice('Wolf River')).toBe(true);
  expect(isPlankBathChoice('pezzo')).toBe(false);
});

test('plank choice: bathrooms and laundry print XL LVP with the plank colour, included at $0', () => {
  const lines = gen('wolf-river');
  for (const loc of ['Main Bathroom', 'Primary Ensuite', 'Laundry Room']) {
    expect(at(lines, loc)).toMatchObject({
      product_name: 'XL Flooring LVP', product_colour: 'Wolf River', status: 'included', amount: 0,
      wizard_field: 'spc_tile_colour',
    });
  }
  expect(sumQuoteLines(lines, 0.05).subtotal).toBe(0);
});

test('tile choice is unchanged: bathrooms Dante with colour, laundry Dante LVT', () => {
  const lines = gen('piccolo');
  expect(at(lines, 'Main Bathroom')).toMatchObject({ product_name: 'Ceratec Dante 2.0', product_colour: 'Piccolo' });
  expect(at(lines, 'Laundry Room')).toMatchObject({ product_name: 'Ceratec Dante 2.0 LVT', product_colour: null });
});

test('laundry row label follows a plank choice; an explicit laundry upgrade still wins', () => {
  expect(plankBathChoiceName('opal')).toBe('Opal');
  expect(laundryValue([], 'opal')).toBe('XL Flooring LVP — Opal (standard)');
  expect(laundryValue([], 'pezzo')).toBe(LAUNDRY_STANDARD_LABEL);
  expect(laundryValue([])).toBe(LAUNDRY_STANDARD_LABEL);
  expect(laundryValue([{ areaId: 'laundry', productName: 'Hardwood X' }], 'opal')).toBe('Hardwood X');
});
