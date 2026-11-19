// =====================================================================
// Teams Adaptive Cards (schema 1.4) and the pricing digest — pure builders (Phase 2 Task 12, spec §6.5–6.6).
//
// ZERO IMPORTS, no Deno/Node/browser globals: used by notify-pricing-request, pricing-digest and bun tests.
// Staff-only channels: internal notes are allowed here; buyer contact details (email / phone) are not — the
// inputs carry only the buyer's name and unit.
// =====================================================================

export const ADAPTIVE_CARD_SCHEMA = 'http://adaptivecards.io/schemas/adaptive-card.json';

export interface PricingRequestCardInput {
  unit: string;
  buyerName: string;
  location: string;
  label: string;
  product?: string | null;
  colour?: string | null;
  /** Staff note for the pricer (the line's internal_note). */
  note?: string | null;
  assigneeName: string;
  /** Console deep link: <portal>/admin/quotes/:submissionId#line-:lineId */
  link: string;
}

type Json = Record<string, unknown>;

const present = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== '';
const orDash = (s: string | null | undefined) => (present(s) ? s.trim() : '—');

export function buildPricingRequestCard(input: PricingRequestCardInput): Json {
  const product = [input.product, input.colour].filter(present).map((s) => s.trim()).join(' · ');
  const facts: Array<{ title: string; value: string }> = [
    { title: 'Unit', value: orDash(input.unit) },
    { title: 'Buyer', value: orDash(input.buyerName) },
    { title: 'Location', value: orDash(input.location) },
    { title: 'Item', value: orDash(input.label) },
  ];
  if (product) facts.push({ title: 'Product', value: product });
  facts.push({ title: 'Assigned to', value: orDash(input.assigneeName) });

  const body: Json[] = [
    { type: 'TextBlock', text: 'Pricing request', weight: 'Bolder', size: 'Medium', wrap: true },
    { type: 'TextBlock', text: `Unit ${orDash(input.unit)} — ${orDash(input.label)}`, isSubtle: true, spacing: 'None', wrap: true },
    { type: 'FactSet', facts },
  ];
  if (present(input.note)) {
    body.push({ type: 'TextBlock', text: 'Note', weight: 'Bolder', spacing: 'Medium', wrap: true });
    body.push({ type: 'TextBlock', text: input.note.trim(), spacing: 'None', wrap: true });
  }
  return {
    type: 'AdaptiveCard',
    $schema: ADAPTIVE_CARD_SCHEMA,
    version: '1.4',
    msteams: { width: 'Full' },
    body,
    actions: [{ type: 'Action.OpenUrl', title: 'Open in portal', url: input.link }],
  };
}

/** The message envelope a Teams Workflows "When a Teams webhook request is received" flow expects. */
export function teamsMessage(card: Json): Json {
  return {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
  };
}

/** Sample request for the settings page's "Send test card" button. */
export function samplePricingRequestInput(link: string): PricingRequestCardInput {
  return {
    unit: '0', buyerName: 'Sample Buyer', location: 'Primary Bedroom', label: 'Test card — premium underpad',
    product: 'Sample product', colour: null, note: 'This is a test from Notification Settings. No action needed.',
    assigneeName: 'Pricing owner', link,
  };
}

export interface DigestLine {
  unit: string;
  buyerName: string;
  location: string;
  label: string;
  note?: string | null;
  ageLabel: string;
  overdue: boolean;
  link: string;
}

export interface DigestGroup { assigneeName: string; lines: DigestLine[] }

export interface DigestInput {
  groups: DigestGroup[];
  /** <portal>/admin/pricing-queue */
  queueLink: string;
  escalationHours: number;
  /** Optional heading, e.g. "Your overdue pricing requests". */
  title?: string;
}

export interface DigestOutput { subject: string; text: string; html: string; card: Json }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const lineSummary = (l: DigestLine) =>
  [`Unit ${orDash(l.unit)}`, l.buyerName, l.location, l.label].filter(present).join(' · ');

/** Grouped summary of open pricing requests as an email (text + html) and an Adaptive Card. Groups keep their order. */
export function buildDigestCardOrText(input: DigestInput): DigestOutput {
  const lines = input.groups.flatMap((g) => g.lines);
  const overdue = lines.filter((l) => l.overdue).length;
  const subject = `Pricing queue: ${lines.length} open, ${overdue} overdue`;
  const title = input.title ?? 'Open pricing requests';
  const rule = `Overdue = waiting more than ${input.escalationHours} h.`;

  const text: string[] = [title, ''];
  const html: string[] = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937">`,
    `<h2 style="margin:0 0 8px">${escapeHtml(title)}</h2>`,
  ];
  const cardBody: Json[] = [{ type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true }];

  if (!lines.length) {
    text.push('No open pricing requests.');
    html.push('<p>No open pricing requests.</p>');
    cardBody.push({ type: 'TextBlock', text: 'No open pricing requests.', wrap: true });
  } else {
    text.push(`${lines.length} open, ${overdue} overdue. ${rule}`);
    html.push(`<p>${lines.length} open, ${overdue} overdue. ${escapeHtml(rule)}</p>`);
    cardBody.push({ type: 'TextBlock', text: `${lines.length} open, ${overdue} overdue. ${rule}`, isSubtle: true, wrap: true });
    for (const g of input.groups) {
      const head = `${g.assigneeName} (${g.lines.length})`;
      text.push('', head);
      html.push(`<h3 style="margin:16px 0 4px">${escapeHtml(head)}</h3><ul style="margin:0;padding-left:18px">`);
      const items: Json[] = [{ type: 'TextBlock', text: head, weight: 'Bolder', wrap: true }];
      for (const l of g.lines) {
        const age = `${l.ageLabel}${l.overdue ? ' (overdue)' : ''}`;
        text.push(`- ${lineSummary(l)} · ${age}`);
        if (present(l.note)) text.push(`  Note: ${l.note.trim()}`);
        text.push(`  ${l.link}`);
        html.push(
          `<li style="margin:4px 0"><a href="${escapeHtml(l.link)}">${escapeHtml(lineSummary(l))}</a> · `
          + `<span style="color:${l.overdue ? '#b91c1c' : '#6b7280'}">${escapeHtml(age)}</span>`
          + (present(l.note) ? `<br><span style="color:#6b7280">Note: ${escapeHtml(l.note.trim())}</span>` : '')
          + '</li>',
        );
        items.push({
          type: 'TextBlock', wrap: true, spacing: 'Small',
          text: `[${lineSummary(l)}](${l.link}) · ${age}`,
          ...(l.overdue ? { color: 'Attention' } : {}),
        });
      }
      html.push('</ul>');
      cardBody.push({ type: 'Container', separator: true, items });
    }
  }
  text.push('', `Pricing queue: ${input.queueLink}`);
  html.push(`<p style="margin-top:16px"><a href="${escapeHtml(input.queueLink)}">Open the pricing queue</a></p></div>`);

  return {
    subject,
    text: text.join('\n'),
    html: html.join(''),
    card: {
      type: 'AdaptiveCard',
      $schema: ADAPTIVE_CARD_SCHEMA,
      version: '1.4',
      msteams: { width: 'Full' },
      body: cardBody,
      actions: [{ type: 'Action.OpenUrl', title: 'Open pricing queue', url: input.queueLink }],
    },
  };
}
