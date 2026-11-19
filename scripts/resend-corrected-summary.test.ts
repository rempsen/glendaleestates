// Task 16 fix round 1: resend-corrected-summary mails only the submission's stored buyer email.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buyerEmailPath, storedBuyerRecipient } from '../supabase/functions/resend-corrected-summary/recipient';

const src = readFileSync(join(import.meta.dir, '../supabase/functions/resend-corrected-summary/index.ts'), 'utf8');

test('stored email is used; missing / malformed → null', () => {
  expect(storedBuyerRecipient({ email: ' Deb@Example.com ' })).toBe('Deb@Example.com');
  expect(storedBuyerRecipient({ email: '' })).toBeNull();
  expect(storedBuyerRecipient({ email: 'not-an-email' })).toBeNull();
  expect(storedBuyerRecipient({ email: 'a@b.co, evil@x.co' })).toBeNull();
  expect(storedBuyerRecipient({})).toBeNull();
  expect(storedBuyerRecipient(null)).toBeNull();
});

test('row lookup encodes the id and selects email only', () => {
  expect(buyerEmailPath('a&b=c')).toBe('buyer_selections?select=email&id=eq.a%26b%3Dc&limit=1');
});

test('index never sends to body.email and gates with authorizeStaffOrAdmin before the lookup', () => {
  expect(src).not.toContain('body.email');
  expect(src).toContain('to: [recipient],');
  expect(src.indexOf('authorizeStaffOrAdmin(req')).toBeLessThan(src.indexOf('buyerEmailPath('));
  expect(src).toContain('status: 404');
  expect(src).toContain('status: 422');
});
