// Shared email theme for ALL outgoing BMD emails (buyer + admin/internal).
// Goal: legible black text on light backgrounds in every email client
// (Gmail, Outlook desktop, Outlook web/Copilot summary, Apple Mail).
//
// All styles are inline-string constants — never use <style> blocks or CSS
// classes alone, because Outlook/Copilot strip or override them.

export const EMAIL_THEME = {
  // Core palette — all text colors are dark for guaranteed contrast.
  colors: {
    text: '#000000',          // primary text, ALWAYS black
    textMuted: '#374151',     // secondary text (still dark enough for AAA)
    textSubtle: '#4b5563',    // tertiary (footer, fine print)
    heading: '#000000',       // headings, also black
    accent: '#1a1a2e',        // brand accent for borders/dividers
    accentSecondary: '#16213e',
    success: '#047857',       // grand-total green (dark enough on white)
    warningBg: '#fffbeb',
    warningBorder: '#f59e0b',
    warningText: '#000000',
    infoBg: '#eff6ff',
    infoBorder: '#2563eb',
    infoText: '#000000',
    docBg: '#fff7ed',
    docBorder: '#f97316',
    docText: '#000000',
    surface: '#ffffff',
    surfaceAlt: '#f9fafb',
    surfaceMuted: '#f3f4f6',
    border: '#e5e7eb',
    borderStrong: '#d1d5db',
  },
  font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
} as const;

// Inline style snippets for common building blocks. Compose, don't extend.
export const styles = {
  body: `margin:0; padding:0; background-color:${EMAIL_THEME.colors.surfaceAlt}; font-family:${EMAIL_THEME.font}; color:${EMAIL_THEME.colors.text};`,
  container: `max-width:700px; margin:0 auto; padding:20px; background:${EMAIL_THEME.colors.surface};`,
  h1: `margin:0 0 16px; color:${EMAIL_THEME.colors.heading}; font-size:24px; font-weight:600; line-height:1.3;`,
  h2: `margin:0 0 12px; color:${EMAIL_THEME.colors.heading}; font-size:18px; font-weight:600; line-height:1.3;`,
  text: `margin:0 0 10px; color:${EMAIL_THEME.colors.text}; font-size:14px; line-height:1.6;`,
  textMuted: `margin:0 0 10px; color:${EMAIL_THEME.colors.textMuted}; font-size:13px; line-height:1.5;`,
  textSubtle: `margin:0; color:${EMAIL_THEME.colors.textSubtle}; font-size:12px; line-height:1.5;`,
  // Card / section
  section: `background:${EMAIL_THEME.colors.surface}; border:1px solid ${EMAIL_THEME.colors.border}; border-radius:8px; padding:18px 20px; margin:16px 0; color:${EMAIL_THEME.colors.text};`,
  sectionAlt: `background:${EMAIL_THEME.colors.surfaceAlt}; border:1px solid ${EMAIL_THEME.colors.border}; border-radius:8px; padding:18px 20px; margin:16px 0; color:${EMAIL_THEME.colors.text};`,
  sectionWarning: `background:${EMAIL_THEME.colors.warningBg}; border:1px solid ${EMAIL_THEME.colors.warningBorder}; border-left:4px solid ${EMAIL_THEME.colors.warningBorder}; border-radius:8px; padding:18px 20px; margin:16px 0; color:${EMAIL_THEME.colors.warningText};`,
  sectionInfo: `background:${EMAIL_THEME.colors.infoBg}; border:1px solid ${EMAIL_THEME.colors.infoBorder}; border-left:4px solid ${EMAIL_THEME.colors.infoBorder}; border-radius:8px; padding:18px 20px; margin:16px 0; color:${EMAIL_THEME.colors.infoText};`,
  sectionDoc: `background:${EMAIL_THEME.colors.docBg}; border:1px solid ${EMAIL_THEME.colors.docBorder}; border-left:4px solid ${EMAIL_THEME.colors.docBorder}; border-radius:8px; padding:18px 20px; margin:16px 0; color:${EMAIL_THEME.colors.docText};`,
  // Tables
  table: `width:100%; border-collapse:collapse; color:${EMAIL_THEME.colors.text};`,
  th: `text-align:left; padding:10px 8px; color:${EMAIL_THEME.colors.text}; font-size:13px; font-weight:600; border-bottom:2px solid ${EMAIL_THEME.colors.borderStrong};`,
  td: `padding:10px 8px; color:${EMAIL_THEME.colors.text}; font-size:14px; border-bottom:1px solid ${EMAIL_THEME.colors.border}; vertical-align:top;`,
  tdRight: `padding:10px 8px; color:${EMAIL_THEME.colors.text}; font-size:14px; border-bottom:1px solid ${EMAIL_THEME.colors.border}; text-align:right; font-weight:500;`,
  tdLabel: `padding:10px 8px; color:${EMAIL_THEME.colors.textMuted}; font-size:13px; font-weight:600; width:35%; border-bottom:1px solid ${EMAIL_THEME.colors.border}; vertical-align:top;`,
  tdValue: `padding:10px 8px; color:${EMAIL_THEME.colors.text}; font-size:14px; border-bottom:1px solid ${EMAIL_THEME.colors.border}; vertical-align:top;`,
  // Header / footer (light)
  header: `padding:30px 40px; background:${EMAIL_THEME.colors.surface}; border-bottom:1px solid ${EMAIL_THEME.colors.border}; text-align:center;`,
  footer: `padding:24px 40px; background:${EMAIL_THEME.colors.surfaceAlt}; border-top:1px solid ${EMAIL_THEME.colors.border}; text-align:center; color:${EMAIL_THEME.colors.textSubtle}; font-size:12px;`,
  // Total rows
  subtotalLabel: `padding:14px 8px 8px; color:${EMAIL_THEME.colors.text}; font-size:14px; border-top:2px solid ${EMAIL_THEME.colors.borderStrong};`,
  subtotalValue: `padding:14px 8px 8px; color:${EMAIL_THEME.colors.text}; font-size:14px; text-align:right; border-top:2px solid ${EMAIL_THEME.colors.borderStrong};`,
  grandTotalLabel: `padding:16px 8px; color:${EMAIL_THEME.colors.text}; font-size:16px; font-weight:700; border-top:2px solid ${EMAIL_THEME.colors.accent};`,
  grandTotalValue: `padding:16px 8px; color:${EMAIL_THEME.colors.success}; font-size:22px; text-align:right; font-weight:700; border-top:2px solid ${EMAIL_THEME.colors.accent};`,
  comments: `background:${EMAIL_THEME.colors.warningBg}; padding:12px 14px; border-radius:6px; margin-top:10px; color:${EMAIL_THEME.colors.text}; font-size:13px; border:1px solid ${EMAIL_THEME.colors.warningBorder};`,
} as const;

// Wraps content with the standard body shell so every email shares the
// same outer chrome (white background, black text, BMD logo header, footer).
export function wrapEmailShell(opts: {
  title: string;
  preheader?: string;
  headingText: string;
  subheadingText?: string;
  bodyHtml: string;
  footerText?: string;
  logoUrl?: string;
}): string {
  const logo = opts.logoUrl || 'https://glendaleestates.lovable.app/images/bmd-logo.png';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <title>${opts.title}</title>
</head>
<body style="${styles.body}">
  ${opts.preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${opts.preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_THEME.colors.surfaceAlt};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:700px; background:${EMAIL_THEME.colors.surface}; border-radius:12px; overflow:hidden; border:1px solid ${EMAIL_THEME.colors.border};">
          <tr>
            <td style="${styles.header}">
              <img src="${logo}" alt="BMD Materials" style="height:42px; margin-bottom:14px; display:inline-block;">
              <h1 style="${styles.h1} text-align:center;">${opts.headingText}</h1>
              ${opts.subheadingText ? `<p style="${styles.text} text-align:center; color:${EMAIL_THEME.colors.textMuted};">${opts.subheadingText}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px; background:${EMAIL_THEME.colors.surface}; color:${EMAIL_THEME.colors.text};">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="${styles.footer}">
              <p style="margin:0 0 6px; color:${EMAIL_THEME.colors.text}; font-weight:600; font-size:13px;">BMD Materials</p>
              <p style="margin:0; color:${EMAIL_THEME.colors.textSubtle}; font-size:12px;">${opts.footerText || 'Glendale Estates Selection Portal'}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
