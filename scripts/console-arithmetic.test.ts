// Phase 2 Task 8: the console shows totals only through RunningTotal and does arithmetic only through lineAmount.
import { test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
const consoleFiles = [
  ...readdirSync(new URL('../src/components/quote/', import.meta.url)).filter((f) => f.endsWith('.tsx') && f !== 'RunningTotal.tsx')
    .map((f) => `../src/components/quote/${f}`),
  '../src/pages/QuoteConsole.tsx',
];
test('console components multiply nothing and never sum totals (RunningTotal / lineAmount own that)', () => {
  expect(consoleFiles.length).toBeGreaterThanOrEqual(7);
  for (const f of consoleFiles) {
    const code = strip(readFileSync(new URL(f, import.meta.url), 'utf8'));
    expect({ f, mult: /[\w)\]]\s*\*\s*[\w(]/.test(code) }).toEqual({ f, mult: false });
    expect({ f, sum: /sumQuoteLines|computeUpgradeTotals|\.reduce\(/.test(code) }).toEqual({ f, sum: false });
    expect({ f, dollars: /\$\d/.test(readFileSync(new URL(f, import.meta.url), 'utf8')) }).toEqual({ f, dollars: false });
  }
});
