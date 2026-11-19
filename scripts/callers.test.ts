import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Source-grep guard: the two pricing engines (client + edge) only agree if every
// caller feeds them the bedroom premium inputs. A caller either builds its input
// through totalsInputFromSelections() or names bedroomPremiumUnderpadSelected itself.

const ROOT = join(import.meta.dir, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('totals callers pass bedroom premium inputs', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase/functions'))];
  const callers = files.filter((f) => {
    const t = readFileSync(f, 'utf8');
    return /computeUpgradeTotals(Server)?\(/.test(t);
  });

  test('finds callers', () => {
    expect(callers.length).toBeGreaterThan(5);
  });

  test('every caller threads the bedroom inputs', () => {
    const bad = callers
      .filter((f) => {
        const t = readFileSync(f, 'utf8');
        return !(t.includes('bedroomPremiumUnderpadSelected') || t.includes('totalsInputFromSelections('));
      })
      .map((f) => f.replace(ROOT + '/', ''));
    expect(bad).toEqual([]);
  });
});

// buyer_selections.window_total is written once at submission (GST-inclusive, that day's prices) and
// never updated by the editor. It is stale, so nothing may read it: every window figure comes from
// computeUpgradeTotals(...).windowSubtotal (pre-GST).
describe('nothing reads the stale window_total column', () => {
  const ALLOWED = new Set([
    'supabase/functions/_shared/submissionRow.ts', // send-selections-email's submit-time INSERT payload only
    'supabase/functions/setup-hubspot-properties/index.ts', // HubSpot property definition (name kept for CRM history)
    'src/lib/buyerPdfSelections.ts', // explicit field mapping
    'src/lib/submissionUpdatePayload.ts', // type field
  ]);
  // `bmd_window_total` (the HubSpot property name) is deliberately not a column read.
  const COLUMN = /(?<![A-Za-z0-9_])window_total(?![A-Za-z0-9_])/;
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase/functions'))].map((f) => ({
    rel: f.replace(ROOT + '/', ''),
    text: readFileSync(f, 'utf8'),
  }));

  test('no file outside the allow-list mentions window_total', () => {
    const bad = files
      .filter((f) => !f.rel.endsWith('integrations/supabase/types.ts') && !ALLOWED.has(f.rel) && COLUMN.test(f.text))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  test('send-selections-email only inserts window_total (once, in its shared insert payload)', () => {
    const t = files.find((f) => f.rel === 'supabase/functions/_shared/submissionRow.ts')!.text;
    expect((t.match(/(?<![A-Za-z0-9_])window_total(?![A-Za-z0-9_])/g) || []).length).toBeLessThanOrEqual(1);
  });
});
