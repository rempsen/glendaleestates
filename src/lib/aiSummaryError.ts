// Toast text for a failed summarize-upgrade-requests call. 402 + ai_monthly_cap_reached is the portal's own monthly token
// cap (portal_settings.ai_monthly_token_cap); 429 is the gateway rate limit; the gateway's own 402 is out of credits.
export const AI_CAP_MESSAGE = 'Monthly AI budget reached — adjust in Settings';

export function summaryErrorMessage(status: number | null | undefined, body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (status === 402 && error === 'ai_monthly_cap_reached') return AI_CAP_MESSAGE;
  return typeof error === 'string' && error ? error : 'Please try again.';
}
