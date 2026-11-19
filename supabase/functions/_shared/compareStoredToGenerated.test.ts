// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/compare-stored-to-generated.test.ts).
import { compareStoredToGenerated } from './compareStoredToGenerated.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };
// deno-lint-ignore no-explicit-any
const L = (section: string, status: string, amount: number | string | null): any => ({ section, status, amount });

if (denoTest) {
  denoTest('equal lines ok, counts', () => {
    const lines = [
      L('flooring', 'upgrade', 100), L('window_coverings', 'upgrade', 50), L('standard', 'included', 0),
      L('other', 'deferred', 999), L('other', 'pending', null), L('other', 'removed', 5000),
    ];
    eq(compareStoredToGenerated(lines, lines), {
      generated_subtotal: 150, stored_subtotal: 150, diff: 0, windows_generated: 50, windows_stored: 50,
      windows_diff: 0, line_count: 6, counted_lines: 2, not_in_total: 2, ok: true,
    });
  });
  denoTest('one cent drift fails', () => {
    const r = compareStoredToGenerated([L('flooring', 'upgrade', 100.01)], [L('flooring', 'upgrade', 100)]);
    eq([r.ok, r.diff], [false, 0.01]);
  });
  denoTest('window section move fails', () => {
    const r = compareStoredToGenerated([L('other', 'upgrade', 40)], [L('window_coverings', 'upgrade', 40)]);
    eq([r.ok, r.diff, r.windows_diff], [false, 0, -40]);
  });
  denoTest('numeric strings summed', () => {
    const r = compareStoredToGenerated([L('tile', 'upgrade', '0.1'), L('tile', 'upgrade', 0.2)], [L('tile', 'upgrade', 0.3)]);
    eq([r.ok, r.stored_subtotal], [true, 0.3]);
  });
  denoTest('no stored lines vs positive generated fails', () => {
    const r = compareStoredToGenerated([], [L('tile', 'upgrade', 10)]);
    eq([r.ok, r.line_count, r.diff], [false, 0, -10]);
  });
}
