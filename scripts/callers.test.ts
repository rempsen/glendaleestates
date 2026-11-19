import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Phase 2 Task 18 guard: `quote_lines` (and its generator, supabase/functions/_shared/quoteLines.ts) is the only
// source of priced truth. The Phase 1 engines are deleted; nothing may import them again, and no file outside the
// generator may do price arithmetic (markup, GST, a hard-coded 1.05, percent-to-rate division).

const ROOT = join(import.meta.dir, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'fixtures') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (f: string) => f.replace(ROOT + '/', '');
const sources = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase/functions')), ...walk(join(ROOT, 'scripts'))]
  .map((f) => ({ rel: rel(f), text: readFileSync(f, 'utf8') }));

/** Deleted in Task 18 (module path without extension). */
const DELETED_MODULES = [
  'src/lib/upgradeTotals',
  'supabase/functions/_shared/upgradeTotalsServer',
  'src/lib/pricingFromDynamic',
  'src/hooks/useWindowSubtotal',
  'src/lib/windowSubtotal',
  'src/lib/engineTotalsInput',
  'src/components/admin/CustomPricingPanel',
  'supabase/functions/_shared/compareEngineToLines',
  'scripts/lib/engineLineKeys',
];

/** Every module specifier a file imports or re-exports (static and dynamic). */
function specifiers(text: string): string[] {
  const out: string[] = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1]);
  return out;
}

describe('the Phase 1 pricing engines are gone', () => {
  test('the deleted modules do not exist', () => {
    const present = DELETED_MODULES.filter((m) => ['.ts', '.tsx'].some((ext) => existsSync(join(ROOT, m + ext))));
    expect(present).toEqual([]);
  });

  test('nothing imports a deleted module', () => {
    const bases = DELETED_MODULES.map((m) => m.split('/').pop()!);
    const bad: string[] = [];
    for (const f of sources) {
      if (f.rel === 'scripts/callers.test.ts') continue;
      for (const spec of specifiers(f.text)) {
        const base = spec.replace(/\.tsx?$/, '').split('/').pop()!;
        if (bases.includes(base)) bad.push(`${f.rel} → ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('no engine entry point is called anywhere (tests may name them to assert their absence)', () => {
    const bad = sources
      .filter((f) => !/\.test\.tsx?$/.test(f.rel))
      .filter((f) => /\b(computeUpgradeTotals|computeUpgradeTotalsServer|totalsInputFromSelections|pricingFromDynamic|useWindowSubtotal)\s*\(/.test(f.text))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });
});

// ---- No price arithmetic outside the generator ----

/**
 * Files allowed to do price arithmetic. Keep this list short and explain each entry.
 * Test files (`*.test.ts`, `*.test.tsx`) are not scanned: they build expected values by hand on purpose.
 */
const ARITHMETIC_ALLOWED: Record<string, string> = {
  'supabase/functions/_shared/quoteLines.ts': 'the generator: every price, markup and GST is computed here',
  'scripts/callers.test.ts': 'this guard (patterns in strings)',
};

// Patterns, applied per line after comments and the cent-rounding idiom `Math.round(x * 100) / 100` are removed.
const ARITHMETIC_PATTERNS: Array<[string, RegExp]> = [
  ['hard-coded GST factor', /\*\s*1\.05\b/],
  ['(1 + markup|gst)', /\(\s*1\s*\+\s*\(?[\w.]*(?:markup|gst)/i],
  ['× markup/GST rate', /(?:markup\w*|gst_?rate|\bGST)\s*(?:\(\))?\s*\*(?!\s*100\b)|\*\s*[\w.]*(?:markup\w*|gst_?rate)\b(?:\(\))?/i],
  ['percent → rate (/ 100)', /\/\s*100\b/],
];

function codeLines(text: string): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  text.split('\n').forEach((raw, i) => {
    // Comment lines (`//`, `/*`, ` * ` JSDoc) are prose, not arithmetic.
    if (/^\s*(\/\/|\/\*|\*)/.test(raw)) return;
    let line = raw.replace(/\/\*.*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/\s.*$/, '$1');
    // Rounding a figure to the cent is not pricing.
    line = line.replace(/\*\s*100\s*\)\s*\/\s*100\b/g, ') ROUND_CENTS');
    out.push([i + 1, line]);
  });
  return out;
}

describe('no price arithmetic outside _shared/quoteLines.ts', () => {
  const scanned = sources.filter((f) => !/\.test\.tsx?$/.test(f.rel) && !f.rel.endsWith('integrations/supabase/types.ts'));

  test('the scan sees the generator and the app', () => {
    expect(scanned.some((f) => f.rel === 'supabase/functions/_shared/quoteLines.ts')).toBe(true);
    expect(scanned.length).toBeGreaterThan(100);
  });

  test('the generator itself matches the patterns (the guard bites)', () => {
    const gen = scanned.find((f) => f.rel === 'supabase/functions/_shared/quoteLines.ts')!;
    expect(codeLines(gen.text).some(([, l]) => ARITHMETIC_PATTERNS.some(([, re]) => re.test(l)))).toBe(true);
  });

  test('every other file is free of markup / GST / percent arithmetic', () => {
    const bad: string[] = [];
    for (const f of scanned) {
      if (ARITHMETIC_ALLOWED[f.rel]) continue;
      for (const [n, line] of codeLines(f.text)) {
        for (const [name, re] of ARITHMETIC_PATTERNS) {
          // Dollars ↔ cents (`Math.round(x * 100) … / 100`) is rounding, not a percent → rate conversion.
          if (name.startsWith('percent') && /Math\.round\(/.test(line)) continue;
          if (re.test(line)) bad.push(`${f.rel}:${n} ${name}: ${line.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('every allow-list entry still exists', () => {
    expect(Object.keys(ARITHMETIC_ALLOWED).filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
  });
});

// buyer_selections.window_total is written once at submission (GST-inclusive, that day's prices) and never updated by
// the editor. It is stale, so nothing may read it: every window figure comes from the window_coverings lines.
describe('nothing reads the stale window_total column', () => {
  const ALLOWED = new Set([
    'supabase/functions/_shared/submissionRow.ts', // send-selections-email's submit-time INSERT payload only
    'supabase/functions/setup-hubspot-properties/index.ts', // HubSpot property definition (name kept for CRM history)
    'src/lib/buyerPdfSelections.ts', // explicit field mapping
    'src/lib/submissionUpdatePayload.ts', // type field
  ]);
  // `bmd_window_total` (the HubSpot property name) is deliberately not a column read.
  const COLUMN = /(?<![A-Za-z0-9_])window_total(?![A-Za-z0-9_])/;
  const files = sources.filter((f) => f.rel.startsWith('src/') || f.rel.startsWith('supabase/functions/'));

  test('no file outside the allow-list mentions window_total', () => {
    const bad = files
      .filter((f) => !f.rel.endsWith('integrations/supabase/types.ts') && !ALLOWED.has(f.rel) && !/\.test\.tsx?$/.test(f.rel) && COLUMN.test(f.text))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  test('send-selections-email only inserts window_total (once, in its shared insert payload)', () => {
    const t = files.find((f) => f.rel === 'supabase/functions/_shared/submissionRow.ts')!.text;
    expect((t.match(/(?<![A-Za-z0-9_])window_total(?![A-Za-z0-9_])/g) || []).length).toBeLessThanOrEqual(1);
  });
});

// custom_pricing stays on buyer_selections, READ-ONLY for audit. Office edits live in the console (quote_lines).
describe('custom_pricing has no writers', () => {
  test('no update/upsert/insert payload sets custom_pricing', () => {
    const bad: string[] = [];
    for (const f of sources) {
      if (/\.test\.tsx?$/.test(f.rel) || f.rel.endsWith('integrations/supabase/types.ts')) continue;
      f.text.split('\n').forEach((line, i) => {
        if (/\bcustom_pricing\s*:/.test(line) && !/\bcustom_pricing\s*:\s*(?:unknown|Json|any|CustomPricing|string|null\s*\|)/.test(line)) {
          bad.push(`${f.rel}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
