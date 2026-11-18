// Helpers for the internal notification recipient list (portal_settings.internal_notification_recipients).

export const RECIPIENTS_KEY = 'internal_notification_recipients';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Trim, validate and de-duplicate (case-insensitive). Returns the new list or an error message. */
export function addRecipient(list: string[], raw: string): { list: string[] } | { error: string } {
  const email = raw.trim();
  if (!isValidEmail(email)) return { error: 'Enter a valid email address.' };
  if (list.some(e => e.toLowerCase() === email.toLowerCase())) return { error: 'That address is already on the list.' };
  return { list: [...list, email] };
}

export function removeRecipient(list: string[], email: string): string[] {
  return list.filter(e => e !== email);
}

/** Coerce a stored jsonb value into a string list, or null when malformed. */
export function parseStoredRecipients(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) return null;
  return value as string[];
}
