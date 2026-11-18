// Deno tests: `deno test supabase/functions/_shared/`. No-op under bun (mirror: scripts/sanitize-changes-for-ai.test.ts).
import { sanitizeChangesForAi } from './sanitizeChangesForAi.ts';

const denoTest = (globalThis as { Deno?: { test: (n: string, f: () => Promise<void> | void) => void } }).Deno?.test;
const eq = (a: unknown, e: unknown) => { if (JSON.stringify(a) !== JSON.stringify(e)) throw new Error(`expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`); };

if (denoTest) {
  const changes = {
    sales_comments: { old: 'a', new: 'Private sales note' },
    admin_notes: { old: null, new: 'Private office note' },
    lvp_colour: { old: 'oak', new: 'ash' },
    area_upgrades: {
      old: [{ areaId: 'laundry', comments: 'INTERNAL old', clientComment: 'buyer old' }],
      new: [{ areaId: 'laundry', comments: 'INTERNAL new', clientComment: 'buyer new' }, 'x'],
    },
  };
  denoTest('top-level internal keys removed', () => {
    const s = sanitizeChangesForAi(changes) as Record<string, unknown>;
    eq(['sales_comments' in s, 'admin_notes' in s], [false, false]);
  });
  denoTest('nested area comments removed, clientComment preserved', () => {
    const s = sanitizeChangesForAi(changes) as Record<string, any>;
    eq(s.area_upgrades, { old: [{ areaId: 'laundry', clientComment: 'buyer old' }], new: [{ areaId: 'laundry', clientComment: 'buyer new' }, 'x'] });
    eq(JSON.stringify(s).includes('INTERNAL') || JSON.stringify(s).includes('Private'), false);
  });
  denoTest('unrelated keys preserved; non-objects pass through', () => {
    eq((sanitizeChangesForAi(changes) as any).lvp_colour, { old: 'oak', new: 'ash' });
    eq(sanitizeChangesForAi(null), null);
  });
}
