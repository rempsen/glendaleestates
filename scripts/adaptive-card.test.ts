// Task 12: Teams Adaptive Card + digest builders (supabase/functions/_shared/adaptiveCard.ts, import-free).
// Deno mirror: supabase/functions/_shared/adaptiveCard.test.ts.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPricingRequestCard, buildDigestCardOrText, teamsMessage, samplePricingRequestInput,
} from '../supabase/functions/_shared/adaptiveCard';

const LINK = 'https://glendaleestates.lovable.app/admin/quotes/sub-1#line-line-9';
const input = {
  unit: '24', buyerName: 'Jane Safiniuk', location: 'Primary Bedroom', label: 'Premium underpad',
  product: 'Healthier Choice 10 mm', colour: 'Grey', note: 'Buyer wants the 10 mm pad — price per sq yd?',
  assigneeName: 'Brian Chornoboy', link: LINK,
};

type Fact = { title: string; value: string };
const facts = (card: Record<string, unknown>): Fact[] =>
  (card.body as Array<Record<string, unknown>>).filter((b) => b.type === 'FactSet').flatMap((b) => b.facts as Fact[]);
const factValue = (card: Record<string, unknown>, title: string) => facts(card).find((f) => f.title === title)?.value;

describe('buildPricingRequestCard', () => {
  const card = buildPricingRequestCard(input) as Record<string, unknown>;

  test('is an Adaptive Card 1.4', () => {
    expect(card.type).toBe('AdaptiveCard');
    expect(card.version).toBe('1.4');
    expect(card.$schema).toBe('http://adaptivecards.io/schemas/adaptive-card.json');
  });

  test('carries unit, buyer, location, label, product, assignee and the note', () => {
    expect(factValue(card, 'Unit')).toBe('24');
    expect(factValue(card, 'Buyer')).toBe('Jane Safiniuk');
    expect(factValue(card, 'Location')).toBe('Primary Bedroom');
    expect(factValue(card, 'Item')).toBe('Premium underpad');
    expect(factValue(card, 'Product')).toBe('Healthier Choice 10 mm · Grey');
    expect(factValue(card, 'Assigned to')).toBe('Brian Chornoboy');
    expect(JSON.stringify(card)).toContain('Buyer wants the 10 mm pad — price per sq yd?');
  });

  test('"Open in portal" opens the console deep link /admin/quotes/:id#line-:lineId', () => {
    const actions = card.actions as Array<Record<string, unknown>>;
    expect(actions).toEqual([{ type: 'Action.OpenUrl', title: 'Open in portal', url: LINK }]);
    expect(LINK).toMatch(/\/admin\/quotes\/[^/#]+#line-.+$/);
  });

  test('optional product / colour / note are omitted, not printed as blanks', () => {
    const bare = buildPricingRequestCard({ ...input, product: null, colour: undefined, note: '  ' }) as Record<string, unknown>;
    expect(factValue(bare, 'Product')).toBeUndefined();
    const json = JSON.stringify(bare);
    expect(json).not.toContain('null');
    expect(json).not.toContain('Note');
  });

  test('colour alone still shows', () => {
    expect(factValue(buildPricingRequestCard({ ...input, product: null, colour: 'Oak' }) as Record<string, unknown>, 'Product')).toBe('Oak');
  });

  test('blank location falls back to an em dash; no buyer contact fields exist on the input', () => {
    const c = buildPricingRequestCard({ ...input, location: '' }) as Record<string, unknown>;
    expect(factValue(c, 'Location')).toBe('—');
    expect(JSON.stringify(c)).not.toMatch(/@|phone|email/i);
  });

  test('teamsMessage wraps the card for a Teams Workflows webhook', () => {
    expect(teamsMessage(card)).toEqual({
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
    });
  });

  test('sample input for the settings "Send test card" button is labelled as a test', () => {
    const s = samplePricingRequestInput('https://x.test/admin/pricing-queue');
    expect(s.label).toContain('Test');
    expect(s.link).toBe('https://x.test/admin/pricing-queue');
  });
});

describe('buildDigestCardOrText', () => {
  const groups = [
    {
      assigneeName: 'Brian Chornoboy',
      lines: [
        { unit: '24', buyerName: 'Jane Safiniuk', location: 'Stairs', label: 'Stair carpet <premium>', note: 'Check & confirm', ageLabel: '6 h', overdue: true, link: LINK },
        { unit: '7', buyerName: 'Al Roy', location: '', label: 'Tile', note: null, ageLabel: '40 min', overdue: false, link: 'https://x.test/admin/quotes/s7#line-l7' },
      ],
    },
    { assigneeName: 'Dan Rosenblat', lines: [{ unit: '31', buyerName: 'B C', location: 'Living Room', label: 'Shade', ageLabel: '2 d 1 h', overdue: true, link: 'https://x.test/l31' }] },
  ];
  const out = buildDigestCardOrText({ groups, queueLink: 'https://x.test/admin/pricing-queue', escalationHours: 4 });

  test('subject counts open and overdue lines', () => {
    expect(out.subject).toBe('Pricing queue: 3 open, 2 overdue');
  });

  test('text groups by assignee in the given order with unit · buyer · location · label · age', () => {
    const iBrian = out.text.indexOf('Brian Chornoboy (2)');
    const iDan = out.text.indexOf('Dan Rosenblat (1)');
    expect(iBrian).toBeGreaterThan(-1);
    expect(iDan).toBeGreaterThan(iBrian);
    expect(out.text).toContain('Unit 24 · Jane Safiniuk · Stairs · Stair carpet <premium> · 6 h (overdue)');
    expect(out.text).toContain('Unit 7 · Al Roy · Tile · 40 min');
    expect(out.text).toContain('https://x.test/admin/pricing-queue');
  });

  test('html escapes staff text and links each line to the console', () => {
    expect(out.html).toContain('Stair carpet &lt;premium&gt;');
    expect(out.html).toContain('Check &amp; confirm');
    expect(out.html).not.toContain('<premium>');
    expect(out.html).toContain(`href="${LINK}"`);
  });

  test('card is Adaptive Card 1.4 with one container per assignee', () => {
    const card = out.card as Record<string, unknown>;
    expect(card.version).toBe('1.4');
    const json = JSON.stringify(card);
    expect(json).toContain('Brian Chornoboy (2)');
    expect(json).toContain('Dan Rosenblat (1)');
    expect((card.actions as Array<{ url: string }>)[0].url).toBe('https://x.test/admin/pricing-queue');
  });

  test('empty queue → nothing to send', () => {
    const empty = buildDigestCardOrText({ groups: [], queueLink: 'https://x.test/q', escalationHours: 4 });
    expect(empty.subject).toBe('Pricing queue: 0 open, 0 overdue');
    expect(empty.text).toContain('No open pricing requests');
  });
});

test('adaptiveCard.ts is import-free (runs in the browser, edge functions and bun)', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/adaptiveCard.ts'), 'utf8');
  expect(src).not.toMatch(/^\s*import\s/m);
  expect(src).not.toMatch(/\bDeno\./);
});
