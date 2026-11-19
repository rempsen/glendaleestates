// resend-confirmation-email renderers (Phase 2 Task 11, spec §6.11). Pure, so the edge-string tests can render
// them. The buyer and admin copies print the submission's stored quote lines (generator fallback when none exist)
// through _shared/linesEmailHtml.ts: seven columns, Standard / Premium upgrades / Not included in total, totals from
// sumQuoteLines only, `Pending` never $0.00. The buyer copy never carries internal notes, sales comments or admin notes.
import { type EmailLines, escapeHtml, renderLinesEmailHtml } from "../_shared/linesEmailHtml.ts";
import { EMAIL_THEME, styles, wrapEmailShell } from "../_shared/emailTheme.ts";
import { MY_QUOTE_LINK_TEXT, MY_QUOTE_URL } from "../_shared/buyerContact.ts";

// deno-lint-ignore no-explicit-any
type SubmissionRow = Record<string, any>;

export function buildBuyerHtml(sub: SubmissionRow, q: EmailLines): string {
  const firstName = sub.first_name as string;
  const unitNumber = sub.unit_number as string;
  const unitType = sub.unit_type as string | null;
  const submissionDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const linesBlock = renderLinesEmailHtml(q.lines, { buyerView: true, gstRate: q.gstRate, pricesAvailable: q.pricesAvailable });

  const interests = Object.entries((sub.upgrade_interests as Record<string, boolean>) || {})
    .filter(([_, v]) => v)
    .map(([k]) => k.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  const interestsHtml = interests.length ? `
    <h2 style="${styles.h2}">Additional Interests</h2>
    <p style="${styles.text}">${interests.map(i => escapeHtml(i)).join(', ')}</p>
    <p style="${styles.textMuted}">Our team will reach out to discuss these options with you.</p>` : '';

  const body = `
    <p style="${styles.text}">Hello <strong>${escapeHtml(firstName)}</strong>, your selections for <strong>Unit ${escapeHtml(unitNumber)}</strong>${unitType ? ` (${escapeHtml(unitType)})` : ''} have been updated. Please review the corrected details and pricing below.</p>
    <p style="${styles.textMuted}">Updated on ${submissionDate}${sub.id ? ` · Reference: ${escapeHtml(String(sub.id).slice(0, 8))}` : ''}</p>
    ${sub.upgrade_floor_selection ? `<p style="${styles.text}"><strong>Floor Selection:</strong> Floor ${escapeHtml(String(sub.upgrade_floor_selection))}</p>` : ''}
    ${linesBlock.html}
    <p style="${styles.text}"><a href="${MY_QUOTE_URL}" style="color:${EMAIL_THEME.colors.accent};font-weight:600;">${MY_QUOTE_LINK_TEXT}</a> — sign in with this email address to accept each line, ask a question or request a change.</p>
    ${interestsHtml}
    <p style="${styles.textMuted}">Questions? Contact us at <a href="mailto:office@bmdmaterials.com" style="color:${EMAIL_THEME.colors.accent};">office@bmdmaterials.com</a>.</p>
  `;

  return wrapEmailShell({
    title: `Updated Selection Confirmation - Unit ${unitNumber}`,
    preheader: `Updated selections and pricing for Unit ${unitNumber}`,
    headingText: 'Updated Selection Confirmation',
    subheadingText: `Unit ${unitNumber}${unitType ? ` · ${unitType}` : ''}`,
    bodyHtml: body,
  });
}

export function buildAdminHtml(sub: SubmissionRow, q: EmailLines, editedBy: string): string {
  const linesBlock = renderLinesEmailHtml(q.lines, { buyerView: false, gstRate: q.gstRate, pricesAvailable: q.pricesAvailable, linesSource: q.linesSource });
  const body = `
    <p style="${styles.text}">A confirmation email has been resent to the buyer with the quote below (staff copy: every line, internal notes last).</p>
    <table style="${styles.table}">
      <tr><td style="${styles.tdLabel}">Unit</td><td style="${styles.tdValue}">${escapeHtml(sub.unit_number)}</td></tr>
      <tr><td style="${styles.tdLabel}">Buyer</td><td style="${styles.tdValue}">${escapeHtml(sub.first_name)} ${escapeHtml(sub.last_name)}</td></tr>
      <tr><td style="${styles.tdLabel}">Email</td><td style="${styles.tdValue}">${escapeHtml(sub.email)}</td></tr>
      <tr><td style="${styles.tdLabel}">Sent By</td><td style="${styles.tdValue}">${escapeHtml(editedBy)}</td></tr>
      <tr><td style="${styles.tdLabel}">Date</td><td style="${styles.tdValue}">${new Date().toLocaleString()}</td></tr>
    </table>
    ${linesBlock.html}
  `;
  return wrapEmailShell({
    title: `Resent Confirmation - Unit ${sub.unit_number}`,
    headingText: 'Confirmation Email Resent',
    subheadingText: `Unit ${sub.unit_number} · ${sub.first_name} ${sub.last_name}`,
    bodyHtml: body,
  });
}

/** The figure the admin UI shows after a resend: the Total the buyer was sent, or null when the buyer copy printed none. */
export function linesGrandTotal(q: EmailLines): number | null {
  return renderLinesEmailHtml(q.lines, { buyerView: true, gstRate: q.gstRate, pricesAvailable: q.pricesAvailable }).totals?.total ?? null;
}
