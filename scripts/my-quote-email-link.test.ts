// Task 13: the buyer confirmation email and its resend link to the live quote at /my-quote.
import { test, expect, describe } from 'bun:test';
import { MY_QUOTE_URL, MY_QUOTE_LINK_TEXT } from '../supabase/functions/_shared/buyerContact.ts';
import { generateBuyerConfirmationEmail, buildPreviewSampleData, previewEmailLines } from '../supabase/functions/send-selections-email/emails.ts';
import { buildBuyerHtml } from '../supabase/functions/resend-confirmation-email/emails.ts';

describe('buyer emails link to /my-quote', () => {
  test('confirmation and resend carry "View your live quote"', () => {
    const data = buildPreviewSampleData({});
    const html = generateBuyerConfirmationEmail(data, 'sel-1', previewEmailLines(data));
    expect(html).toContain(`href="${MY_QUOTE_URL}"`);
    expect(html).toContain(MY_QUOTE_LINK_TEXT);
    const resend = buildBuyerHtml({ id: 's', unit_number: '24', first_name: 'Ann', last_name: 'Lee', email: 'a@b.co' }, { lines: [], gstRate: 0.05, pricesAvailable: true });
    expect(resend).toContain(`href="${MY_QUOTE_URL}"`);
    expect(resend).toContain(MY_QUOTE_LINK_TEXT);
  });
});

