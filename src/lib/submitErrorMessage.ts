// Buyer-facing message for a failed send-selections-email submit.
// `code` is the `error` field of the response body (save_failed, post_save_failed, internal_error).
export const SUBMIT_SAVE_FAILED = 'We could not save your selections. Nothing was sent. Your draft is kept, please try again.';
export const SUBMIT_POST_SAVE_FAILED =
  "Your selections were saved, but we couldn't finish sending the confirmation email. Please do not submit again — contact us and we'll resend it.";
export const SUBMIT_UNKNOWN_500 =
  'Something went wrong. Your draft is kept. If you already saw a confirmation email, do not submit again.';

export function submitErrorMessage(status: number, code?: string): string {
  if (status === 500) {
    if (code === 'save_failed') return SUBMIT_SAVE_FAILED;
    if (code === 'post_save_failed') return SUBMIT_POST_SAVE_FAILED;
    return SUBMIT_UNKNOWN_500;
  }
  if (status === 403) return 'The email on this form must match the email you signed in with.';
  if (status === 401) return 'Your session has expired. Please sign in again, your draft is kept.';
  return 'Please try again or contact support. Your draft is kept.';
}
