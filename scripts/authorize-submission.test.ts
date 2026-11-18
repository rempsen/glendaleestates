import { test, expect } from 'bun:test';
import {
  authorizeSubmission, authorizeAdmin, bearerToken, parseRecipients, SEED_NOTIFICATION_RECIPIENTS,
} from '../supabase/functions/_shared/authorizeSubmission';

const buyer = async (jwt: string) => (jwt === 'buyer-jwt' ? { email: 'Buyer@Example.com' } : null);
const admin = async (jwt: string) => (jwt === 'admin-jwt' ? { email: 'dan@bmdmaterials.com', isAdmin: true } : null);
const both = async (jwt: string) => (await buyer(jwt)) ?? (await admin(jwt));

test('no Authorization header -> 401', async () => {
  expect(await authorizeSubmission(null, 'buyer@example.com', both)).toEqual({ ok: false, status: 401 });
});
test('non-Bearer header -> 401', async () => {
  expect(await authorizeSubmission('Basic abc', 'buyer@example.com', both)).toEqual({ ok: false, status: 401 });
});
test('anon key / any JWT without a user -> 401', async () => {
  expect(await authorizeSubmission('Bearer anon-key', 'buyer@example.com', both)).toEqual({ ok: false, status: 401 });
});
test('getUser throwing -> 401', async () => {
  const boom = async () => { throw new Error('network'); };
  expect(await authorizeSubmission('Bearer x', 'a@b.co', boom)).toEqual({ ok: false, status: 401 });
});
test('buyer submitting under another email -> 403', async () => {
  expect(await authorizeSubmission('Bearer buyer-jwt', 'someone-else@example.com', both)).toEqual({ ok: false, status: 403 });
});
test('matching email (case-insensitive) -> ok', async () => {
  expect(await authorizeSubmission('Bearer buyer-jwt', 'buyer@example.COM', both)).toEqual({ ok: true, email: 'Buyer@Example.com' });
});
test('admin submitting for a different email -> ok', async () => {
  expect(await authorizeSubmission('Bearer admin-jwt', 'buyer@example.com', both)).toEqual({ ok: true, email: 'dan@bmdmaterials.com' });
});
test('authorizeAdmin: 401 / 403 / ok', async () => {
  expect(await authorizeAdmin(null, both)).toEqual({ ok: false, status: 401 });
  expect(await authorizeAdmin('Bearer buyer-jwt', both)).toEqual({ ok: false, status: 403 });
  expect(await authorizeAdmin('Bearer admin-jwt', both)).toEqual({ ok: true, email: 'dan@bmdmaterials.com' });
});
test('bearerToken parsing', () => {
  expect(bearerToken('Bearer abc.def')).toBe('abc.def');
  expect(bearerToken('bearer abc')).toBe('abc');
  expect(bearerToken('Bearer')).toBeNull();
  expect(bearerToken('')).toBeNull();
});
test('parseRecipients: valid list is cleaned and de-duplicated', () => {
  expect(parseRecipients([' a@b.co ', 'A@B.co', 'c@d.org'])).toEqual(['a@b.co', 'c@d.org']);
});
test('parseRecipients: malformed or empty -> null (caller falls back to seed)', () => {
  expect(parseRecipients(undefined)).toBeNull();
  expect(parseRecipients('a@b.co')).toBeNull();
  expect(parseRecipients([])).toBeNull();
  expect(parseRecipients(['not-an-email'])).toBeNull();
  expect(parseRecipients(['a@b.co', 5])).toBeNull();
});
test('seed list matches the brief', () => {
  expect([...SEED_NOTIFICATION_RECIPIENTS]).toEqual([
    'dan@bmdmaterials.com', 'noni@bmdmaterials.com', 'brian@bmdmaterials.com',
    'office@bmdmaterials.com', 'gregor.mckenzie@nvc360.com',
  ]);
});
