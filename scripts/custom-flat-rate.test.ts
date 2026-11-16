import { test, expect } from 'bun:test';
import { costFromGstInclusive, clientPriceInclGst, clientPriceExGst } from '../src/lib/customFlatRate';
test('price entered incl. 5% GST is stored pre-GST', () => { expect(costFromGstInclusive(1050, 0.05)).toBe(1000); });
test('global markup applies to custom flat rate', () => {
  expect(clientPriceExGst(1000, 0.6)).toBe(1600);
  expect(clientPriceInclGst(1000, 0.6, 0.05)).toBe(1680);
});
