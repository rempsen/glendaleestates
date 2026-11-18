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
