// Final fix wave I2: buyer identity is the JWT email, so production requires Confirm email ON. With it on, signUp
// returns no session: BuyerAuth tells the buyer to confirm (never "you can now continue") and switches to sign-in.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signUpOutcome, CONFIRM_EMAIL_TITLE } from '../src/lib/buyerSignUp';

test('no session after signUp → confirm_email; a session (autoconfirm, dev only) → signed_in', () => {
  expect(signUpOutcome({ session: null })).toBe('confirm_email');
  expect(signUpOutcome({})).toBe('confirm_email');
  expect(signUpOutcome(null)).toBe('confirm_email');
  expect(signUpOutcome({ session: { access_token: 't' } })).toBe('signed_in');
  expect(CONFIRM_EMAIL_TITLE).toBe('Check your email to confirm');
});

test('BuyerAuth branches on the outcome before claiming success', () => {
  const src = readFileSync(join(import.meta.dir, '../src/pages/BuyerAuth.tsx'), 'utf8');
  const confirm = src.indexOf("signUpOutcome(signUpData) === 'confirm_email'");
  expect(confirm).toBeGreaterThan(0);
  expect(src.indexOf("toast.success(CONFIRM_EMAIL_TITLE, { description: CONFIRM_EMAIL_TEXT })")).toBeGreaterThan(confirm);
  expect(src.indexOf("'Account created successfully!'")).toBeGreaterThan(confirm);
});

test('runbook and AGENTS carry the Confirm email precondition', () => {
  const runbook = readFileSync(join(import.meta.dir, '../docs/deploy/phase2-runbook.md'), 'utf8');
  const agents = readFileSync(join(import.meta.dir, '../AGENTS.md'), 'utf8');
  expect(runbook).toContain('Confirm email ON');
  expect(agents).toContain('Confirm email ON');
});
