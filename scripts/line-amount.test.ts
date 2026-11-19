// Phase 2 Task 8: the console's single allowed arithmetic — amount = qty × unit price when both are present.
import { test, expect, describe } from 'bun:test';
import { lineAmount } from '../src/lib/lineAmount';

describe('lineAmount', () => {
  test('qty × unit price when both present', () => {
    expect(lineAmount(2, 637.5, null)).toBe(1275);
    expect(lineAmount(44, 9.6, 999)).toBe(422.4); // computed wins over a stale typed amount
  });
  test('float noise is normalised, not cent-rounded', () => {
    expect(lineAmount(44, 6 * 1.6, null)).toBe(422.4);
    expect(lineAmount(3, 0.1, null)).toBe(0.3);
    expect(lineAmount(1, 1.005, null)).toBe(1.005);
  });
  test('falls back to the typed amount when qty or unit price is missing', () => {
    expect(lineAmount(null, 637.5, 1005)).toBe(1005);
    expect(lineAmount(2, null, 1005)).toBe(1005);
    expect(lineAmount(undefined, undefined, 12.5)).toBe(12.5);
  });
  test('nothing known → null (Pending, never $0)', () => {
    expect(lineAmount(null, null, null)).toBeNull();
    expect(lineAmount(2, null, undefined)).toBeNull();
  });
  test('non-finite inputs are treated as missing', () => {
    expect(lineAmount(Number.NaN, 5, 7)).toBe(7);
    expect(lineAmount(2, Number.POSITIVE_INFINITY, null)).toBeNull();
    expect(lineAmount(2, 5, Number.NaN)).toBe(10);
    expect(lineAmount(null, 5, Number.NaN)).toBeNull();
  });
  test('zero is a value, not missing', () => {
    expect(lineAmount(0, 5, 99)).toBe(0);
    expect(lineAmount(null, null, 0)).toBe(0);
  });
});
