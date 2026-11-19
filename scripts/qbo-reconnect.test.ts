// Phase 2 Task 15: the QuickBooks settings page shows a reconnect banner from stored data, never a hard-coded date.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { qboReconnectReason } from '../src/lib/qboReconnect';

const NOW = Date.parse('2026-11-18T18:00:00Z');
const conn = (exp: string | null, created = '2026-05-07T00:00:00Z') => ({ refresh_token_expires_at: exp, created_at: created });

test('expired refresh token (stored 2026-08-15) → banner', () => {
  expect(qboReconnectReason(conn('2026-08-15T12:00:00Z'), null, NOW)).toContain('expired on August 15, 2026');
});
test('valid token and no token error → no banner', () => {
  expect(qboReconnectReason(conn('2027-02-01T00:00:00Z'), { status: 'success', error_message: null, created_at: '2026-11-18T00:00:00Z' }, NOW)).toBeNull();
  expect(qboReconnectReason(null, null, NOW)).toBeNull();
});
test('last sync failed on token refresh after this connection → banner; before it (old connection) → none', () => {
  const err = { status: 'error', error_message: 'QBO token refresh failed: {"error":"invalid_grant"}', created_at: '2026-11-10T00:00:00Z' };
  expect(qboReconnectReason(conn(null), err, NOW)).toContain('no longer valid');
  expect(qboReconnectReason(conn(null, '2026-11-12T00:00:00Z'), err, NOW)).toBeNull();
  expect(qboReconnectReason(conn(null), { ...err, error_message: 'quote has unpriced lines' }, NOW)).toBeNull();
});
test('the page uses the helper and the existing connect flow, with no hard-coded expiry date', () => {
  const src = readFileSync(new URL('../src/pages/AdminQuickBooksSettings.tsx', import.meta.url), 'utf8');
  expect(src).toContain('qboReconnectReason(');
  expect(src).toContain("'qbo-oauth-start'");
  expect(src).not.toMatch(/2026-08-15|August 15/);
});
