// The app imports the shared generator through `@/lib/quoteLines` → `@shared/quoteLines`; bun must resolve it too
// (root tsconfig.json paths), not only Vite and tsconfig.app.json.
import { test, expect } from 'bun:test';
import { generateQuoteLines, sumQuoteLines, SECTION_ORDER } from '@/lib/quoteLines';
import * as direct from '../supabase/functions/_shared/quoteLines.ts';

test('@/lib/quoteLines resolves to the shared module', () => {
  expect(generateQuoteLines).toBe(direct.generateQuoteLines);
  expect(sumQuoteLines).toBe(direct.sumQuoteLines);
  expect(SECTION_ORDER[0]).toBe('standard');
});
