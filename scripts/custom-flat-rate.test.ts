import { test, expect } from 'bun:test';
import { gstInclusiveFromCost } from '../src/lib/customFlatRate';
test('flat-rate price is already marked up: client sees price + 5% GST only', () => {
  expect(gstInclusiveFromCost(1000, 0.05)).toBe(1050);
});
