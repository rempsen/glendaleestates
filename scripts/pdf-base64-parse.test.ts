// Ledgered pre-existing bug (Task 11): parseSelectionBody dropped `pdfBase64`, so send-selections-email forwarded
// `pdf_base64: null` to sync-hubspot and HubSpot never received the PDF. Now parsed, with an 8 MB cap (over the cap:
// dropped with a logged warning, never a 400 — the submission must still save).
import { test, expect, spyOn } from 'bun:test';
import { parseSelectionBody, MAX_PDF_BASE64_CHARS } from '../supabase/functions/_shared/submissionRow';

const body = (extra: Record<string, unknown>) => ({ unitNumber: '24', firstName: 'A', lastName: 'B', email: 'a@b.co', ...extra });

test('pdfBase64 is carried through to the parsed data', () => {
  expect(parseSelectionBody(body({ pdfBase64: 'JVBERi0xLjQK' })).pdfBase64).toBe('JVBERi0xLjQK');
});

test('the value is passed through unchanged (the wizard sends bare base64)', () => {
  expect(parseSelectionBody(body({ pdfBase64: 'data:application/pdf;base64,JVBERi0=' })).pdfBase64).toBe('data:application/pdf;base64,JVBERi0=');
});

test('missing, empty or non-string pdfBase64 parses to null', () => {
  expect(parseSelectionBody(body({})).pdfBase64).toBeNull();
  expect(parseSelectionBody(body({ pdfBase64: '' })).pdfBase64).toBeNull();
  expect(parseSelectionBody(body({ pdfBase64: 42 })).pdfBase64).toBeNull();
});

test('over 8 MB: dropped with a warning, the rest of the body still parses', () => {
  expect(MAX_PDF_BASE64_CHARS).toBe(8 * 1024 * 1024);
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const d = parseSelectionBody(body({ pdfBase64: 'A'.repeat(MAX_PDF_BASE64_CHARS + 1) }));
    expect(d.pdfBase64).toBeNull();
    expect(d.unitNumber).toBe('24');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('pdfBase64');
  } finally {
    warn.mockRestore();
  }
});

test('exactly 8 MB is accepted', () => {
  expect(parseSelectionBody(body({ pdfBase64: 'A'.repeat(MAX_PDF_BASE64_CHARS) })).pdfBase64?.length).toBe(MAX_PDF_BASE64_CHARS);
});
