// Deno tests: `deno test supabase/functions/`. No-op under bun (mirror: scripts/adaptive-card.test.ts).
import { buildDigestCardOrText, buildPricingRequestCard, teamsMessage } from './adaptiveCard.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

if (denoTest) {
  const link = 'https://p.test/admin/quotes/s1#line-l1';
  const card = buildPricingRequestCard({
    unit: '24', buyerName: 'Jane Safiniuk', location: 'Primary Bedroom', label: 'Premium underpad', note: 'per sq yd?',
    assigneeName: 'Brian', link,
  });
  denoTest('card is Adaptive Card 1.4 with the deep link', () => {
    ok(card.version === '1.4' && card.type === 'AdaptiveCard', 'version');
    ok(JSON.stringify(card.actions) === JSON.stringify([{ type: 'Action.OpenUrl', title: 'Open in portal', url: link }]), 'link');
  });
  denoTest('card carries unit, buyer, location, label and note', () => {
    const s = JSON.stringify(card);
    for (const v of ['"24"', 'Jane Safiniuk', 'Primary Bedroom', 'Premium underpad', 'per sq yd?']) ok(s.includes(v), v);
  });
  denoTest('teamsMessage envelope', () => {
    const m = teamsMessage(card) as { type: string; attachments: Array<{ contentType: string }> };
    ok(m.type === 'message' && m.attachments[0].contentType === 'application/vnd.microsoft.card.adaptive', 'envelope');
  });
  denoTest('digest escapes html and counts', () => {
    const d = buildDigestCardOrText({
      groups: [{ assigneeName: 'B', lines: [{ unit: '1', buyerName: 'X', location: '', label: '<b>', ageLabel: '5 h', overdue: true, link }] }],
      queueLink: 'https://p.test/admin/pricing-queue', escalationHours: 4,
    });
    ok(d.subject === 'Pricing queue: 1 open, 1 overdue', d.subject);
    ok(d.html.includes('&lt;b&gt;') && !d.html.includes('<b>'), 'escape');
  });
}
