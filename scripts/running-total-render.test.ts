// Phase 2 Task 4: RunningTotal smoke render via react-dom/server (no DOM lib).
import { test, expect, describe } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunningTotal } from '../src/components/quote/RunningTotal';
import type { QuoteLine } from '@/lib/quoteLines';

const line = (over: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 1, section: 'flooring', location: 'Kitchen', label: 'LVP', unit: 'flat', pricing_mode: 'manual',
  status: 'upgrade', client_visible: true, source: 'office', provisional: false, amount: 1000, ...over,
});
const lines = [
  line({}),
  line({ section: 'window_coverings', location: 'Living', label: 'Blinds', amount: 5 }),
  line({ location: 'Garage', label: 'Epoxy', status: 'pending', amount: null }),
];
const at = new Date(2026, 10, 18, 9, 5, 7);
const render = (props: Partial<Parameters<typeof RunningTotal>[0]> = {}) =>
  renderToStaticMarkup(createElement(RunningTotal, { lines, gstRate: 0.05, buyerView: false, saveState: { status: 'saved', at }, ...props }));

describe('RunningTotal render', () => {
  test('desktop variant has the required strings', () => {
    const html = render({ variant: 'desktop' });
    for (const s of ['Upgrades', 'Window coverings', 'Subtotal', 'GST 5%', 'Total', 'Saved ✓ 09:05:07', 'Not included in total', 'Pending', '$1,005.00', '$1,055.25']) {
      expect(html).toContain(s);
    }
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<aside');
    expect(html).not.toContain('$0.00');
  });

  test('auto variant renders both desktop aside and mobile bar', () => {
    const html = render();
    expect(html).toContain('<aside');
    expect(html).toContain('Total $1,055.25');
  });

  test('save states', () => {
    expect(render({ variant: 'desktop', saveState: { status: 'saving' } })).toContain('Saving…');
    const err = render({ variant: 'desktop', saveState: { status: 'error' }, onRetry: () => {} });
    expect(err).toMatch(/<button[^>]*>Save failed — retry<\/button>/);
    const idle = render({ variant: 'desktop', saveState: { status: 'idle' } });
    expect(idle).not.toContain('Saved');
    expect(idle).not.toContain('Saving');
  });

  test('buyerView hides internal lines', () => {
    const html = render({ variant: 'desktop', buyerView: true, lines: [line({ label: 'Secret', client_visible: false }), line({ label: 'Open' })] });
    expect(html).not.toContain('Secret');
    expect(html).toContain('Open');
  });
});
