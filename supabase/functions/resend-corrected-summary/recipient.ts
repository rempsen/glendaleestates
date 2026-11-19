// Task 16 fix round 1: the corrected summary goes only to the submission's stored buyer email. The request's `email`
// field is ignored, so a staff caller cannot point a buyer's PDF at another address. Pure; tested in
// scripts/resend-corrected-summary.test.ts.
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** The stored buyer address, trimmed, or null when the row is missing or has no usable email. */
export function storedBuyerRecipient(row: { email?: unknown } | null | undefined): string | null {
  const e = typeof row?.email === 'string' ? row.email.trim() : '';
  return EMAIL.test(e) ? e : null;
}

/** REST path for the stored row (encoded id; email only). */
export function buyerEmailPath(submissionId: string): string {
  return `buyer_selections?select=email&id=eq.${encodeURIComponent(submissionId)}&limit=1`;
}
