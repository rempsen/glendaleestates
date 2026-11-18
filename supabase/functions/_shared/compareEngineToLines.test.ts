// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/compare-engine-to-lines.test.ts).
import { compareEngineToLines } from './compareEngineToLines.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };
// deno-lint-ignore no-explicit-any
const L = (section: string, status: string, amount: number | string | null): any => ({ section, status, amount });

if (denoTest) {
  denoTest('equal totals ok, counts', () => eq(
    compareEngineToLines({ grandSubtotal: 150, windowSubtotal: 50 }, [
      L('flooring', 'upgrade', 100), L('window_coverings', 'upgrade', 50), L('standard', 'included', 0),
      L('other', 'deferred', 999), L('other', 'pending', null), L('other', 'removed', 5000),
    ]),
    { engine_subtotal: 150, lines_subtotal: 150, diff: 0, windows_engine: 50, windows_lines: 50,
      windows_diff: 0, line_count: 6, counted_lines: 2, not_in_total: 2, ok: true },
  ));
  denoTest('one cent drift fails', () => {
    const r = compareEngineToLines({ grandSubtotal: 100, windowSubtotal: 0 }, [L('flooring', 'upgrade', 100.01)]);
    eq([r.ok, r.diff], [false, 0.01]);
  });
  denoTest('window mismatch fails', () => {
    const r = compareEngineToLines({ grandSubtotal: 100, windowSubtotal: 40 }, [L('flooring', 'upgrade', 100)]);
    eq([r.ok, r.windows_diff], [false, -40]);
  });
  denoTest('numeric strings summed', () => {
    const r = compareEngineToLines({ grandSubtotal: 0.3, windowSubtotal: 0 }, [L('tile', 'upgrade', '0.1'), L('tile', 'upgrade', 0.2)]);
    eq([r.ok, r.lines_subtotal], [true, 0.3]);
  });
  denoTest('no lines vs positive engine fails', () => {
    const r = compareEngineToLines({ grandSubtotal: 10, windowSubtotal: 0 }, []);
    eq([r.ok, r.line_count, r.diff], [false, 0, -10]);
  });
}
