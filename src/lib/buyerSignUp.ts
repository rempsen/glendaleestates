// Buyer sign-up outcome (final fix wave I2). Buyer identity is the JWT email (get_my_quote_* and request_quote_change
// match on it), so production must require email confirmation (Supabase Auth → Providers → Email → Confirm email ON;
// runbook preconditions). With confirmation on, signUp returns a user but no session: the buyer is told to confirm,
// never told they are signed in.
export const CONFIRM_EMAIL_TITLE = 'Check your email to confirm';
export const CONFIRM_EMAIL_TEXT = 'We sent you a confirmation link. Open it, then sign in to continue with your selections.';

export type SignUpOutcome = 'signed_in' | 'confirm_email';

export function signUpOutcome(data: { session?: { access_token?: string } | null } | null | undefined): SignUpOutcome {
  return data?.session?.access_token ? 'signed_in' : 'confirm_email';
}
