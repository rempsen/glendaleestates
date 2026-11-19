// Buyer-facing contact copy and portal links (Phase 2 Task 13). Zero imports: shared by the browser (`@shared/*`),
// the email edge functions and bun tests. The office address is the one every buyer email already prints.
export const OFFICE_EMAIL = 'office@bmdmaterials.com';
export const OFFICE_CONTACT_TEXT = `Contact us at ${OFFICE_EMAIL}`;

/** The portal origin buyer emails link to (same as send-draft-reminder's portalUrl). */
export const PORTAL_URL = 'https://glendaleestates.lovable.app';
export const MY_QUOTE_PATH = '/my-quote';
export const MY_QUOTE_URL = `${PORTAL_URL}${MY_QUOTE_PATH}`;
export const MY_QUOTE_LINK_TEXT = 'View your live quote';
