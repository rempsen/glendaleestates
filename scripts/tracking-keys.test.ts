// DownstreamTrackingPanel keys (Phase 2 Task 18): tracking rows hang off quote lines by quote_line_id, rows saved
// before the cutover keep resolving through their legacy line_key, and lines not yet stored cannot be tracked.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPmCanonicalLines, isGeneratedLineKey, legacyKeysForLines, trackingKeyFor } from '../src/lib/submissionLineItems';
import type { QuoteLine } from '../src/lib/quoteLines';

const line = (over: Partial<QuoteLine>): QuoteLine => ({
  sort_order: 10, section: 'tile', location: 'Bathrooms', label: 'Porcelain tile', unit: 'sqft', pricing_mode: 'catalog',
  status: 'upgrade', client_visible: true, source: 'wizard', provisional: false, amount: 100, wizard_field: 'bathroom_tile_selected', ...over,
});

test('stored line, no tracking yet → keyed by quote_line_id, editable', () => {
  expect(trackingKeyFor({ quote_line_id: 'q-1' }, 'bathroom_tile', {})).toEqual({ key: 'q-1', editable: true });
});

test('stored line with a legacy row → the legacy row is read and updated (not duplicated)', () => {
  expect(trackingKeyFor({ quote_line_id: 'q-1' }, 'bathroom_tile', { bathroom_tile: {} })).toEqual({ key: 'bathroom_tile', editable: true });
});

test('a row under the quote_line_id wins over a legacy row', () => {
  expect(trackingKeyFor({ quote_line_id: 'q-1' }, 'bathroom_tile', new Set(['bathroom_tile', 'q-1']))).toEqual({ key: 'q-1', editable: true });
});

test('a generated (not yet stored) line is read-only', () => {
  const [cl] = buildPmCanonicalLines([line({})]);
  expect(isGeneratedLineKey(cl.quote_line_id)).toBe(true);
  expect(trackingKeyFor(cl, undefined, {})).toEqual({ key: cl.quote_line_id, editable: false });
});

test('legacy keys resolve end to end for stored lines', () => {
  const lines = [line({ id: 'q-9' })];
  const canonical = buildPmCanonicalLines(lines);
  const legacy = legacyKeysForLines(lines, canonical);
  expect(trackingKeyFor(canonical[0], legacy.get('q-9'), { bathroom_tile: {} })).toEqual({ key: 'bathroom_tile', editable: true });
});

test('the panel reads lines (no engine), blocks generated keys with "Save the quote first", never saves them', () => {
  const src = readFileSync(join(import.meta.dir, '../src/components/admin/DownstreamTrackingPanel.tsx'), 'utf8');
  expect(src).toContain('loadLinesForSubmissions(');
  expect(src).toContain('trackingKeyFor(');
  expect(src).toContain('Save the quote first');
  expect(src).toContain('!isGeneratedLineKey(l.line_key)');
  expect(src).not.toMatch(/computeUpgradeTotals|buildCanonicalLines\(/);
});
