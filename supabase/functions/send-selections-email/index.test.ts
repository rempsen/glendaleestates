// Deno tests for the pure submission guard. Run: deno test supabase/functions/send-selections-email/
// (No-ops under bun, which also globs *.test.ts; the bun mirror lives in scripts/authorize-submission.test.ts.)
import { authorizeAdmin, authorizeSubmission, parseRecipients } from '../_shared/authorizeSubmission.ts';

const denoTest = (globalThis as { Deno?: { test: (name: string, fn: () => Promise<void> | void) => void } }).Deno?.test;

function eq(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

if (denoTest) {
  const getUser = async (jwt: string) =>
    jwt === 'buyer-jwt' ? { email: 'Buyer@Example.com' }
    : jwt === 'admin-jwt' ? { email: 'dan@bmdmaterials.com', isAdmin: true }
    : null;

  denoTest('no header -> 401', async () => eq(await authorizeSubmission(null, 'buyer@example.com', getUser), { ok: false, status: 401 }));
  denoTest('anon key -> 401', async () => eq(await authorizeSubmission('Bearer anon', 'buyer@example.com', getUser), { ok: false, status: 401 }));
  denoTest('mismatched email -> 403', async () => eq(await authorizeSubmission('Bearer buyer-jwt', 'x@y.co', getUser), { ok: false, status: 403 }));
  denoTest('matching email -> ok', async () => eq(await authorizeSubmission('Bearer buyer-jwt', 'buyer@example.com', getUser), { ok: true, email: 'Buyer@Example.com' }));
  denoTest('admin mismatch -> ok', async () => eq(await authorizeSubmission('Bearer admin-jwt', 'x@y.co', getUser), { ok: true, email: 'dan@bmdmaterials.com' }));
  denoTest('authorizeAdmin buyer -> 403', async () => eq(await authorizeAdmin('Bearer buyer-jwt', getUser), { ok: false, status: 403 }));
  denoTest('parseRecipients malformed -> null', () => eq(parseRecipients(['nope']), null));
}
