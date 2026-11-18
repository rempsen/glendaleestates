// Phase 2 Task 3: generated quote lines must reproduce BOTH Phase 1 engines to the cent on every live unit,
// line for line. The engines stay the oracle until Task 18 deletes them.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import { loadFixturePricing, type PricingSnapshot } from './lib/fixturePricing';
import { computeUpgradeTotals } from '../src/lib/upgradeTotals';
import { computeUpgradeTotalsServer, type ServerAreaUpgrade } from '../supabase/functions/_shared/upgradeTotalsServer';
import { serverPricingFromRows } from '../supabase/functions/_shared/loadServerPricing';
import { totalsInputFromSelections } from '../src/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';
import { normalizeUnitTypeCode } from '../src/lib/upgradeCostData';
import { baseSpecFor } from '../src/lib/baseSpec';
import { generateQuoteLines, sumQuoteLines, type QuoteLine } from '../supabase/functions/_shared/quoteLines.ts';

// Copied verbatim from scripts/parity.test.ts (EXPECTED_SUBTOTALS); these pins never change.
const EXPECTED_SUBTOTALS: Record<string, number> = {
  '2': 2460,
  '4': 14334,
  '7': 3296.7, // 2026-11-18: +451.20 premium underpad (flag was never priced); reported to Dan by the controller, no override written
  '24': 10388.4,
  '27': 0,
  // Engine subtotal 27,263.00 vs. the staff note of 2026-11-16 "$27,204.50 plus GST" (gap $58.50, origin unknown).
  // Pinned at the engine value on 2026-11-18; to be investigated in Phase 2 parity work.
  '31': 27263,
  '37': 10488.5,
  '38': 2680.5,
  '43': 23865,
};

const snapshot = pricingSnapshot as unknown as PricingSnapshot;
const clientPricing = loadFixturePricing(snapshot);
// Same rows the edge loader reads (restPricingFetcher filters upgrade_materials to is_active).
const serverPricing = serverPricingFromRows({
  pricing_config: snapshot.pricing_config,
  upgrade_materials: snapshot.upgrade_materials.filter((m) => m.is_active),
  unit_area_data: snapshot.unit_area_data,
});
type Row = Parameters<typeof toBuyerPdfSelections>[0];
const rows = liveSubmissions as unknown as Row[];

function engines(row: Row) {
  const code = row.unit_type ? normalizeUnitTypeCode(row.unit_type) : null;
  const selections = toBuyerPdfSelections(row);
  const client = computeUpgradeTotals(totalsInputFromSelections(selections, code), clientPricing);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = row as any;
  // Same mapping as audit-pricing-consistency / qbo-sync-submission (raw row → ServerTotalsInput).
  const server = computeUpgradeTotalsServer({
    unitTypeCode: code,
    upgradeFloorSelection: sub.upgrade_floor_selection,
    areaUpgrades: (sub.area_upgrades as ServerAreaUpgrade[]) || [],
    backsplashGroutEnabled: sub.backsplash_grout_enabled,
    backsplashGroutColor: sub.backsplash_grout_color,
    stairLvpUpgradeSelected: sub.stair_lvp_upgrade_selected,
    stairPremiumCarpetSelected: sub.stair_premium_carpet_selected, stairPremiumUnderpadSelected: sub.premium_underpad_stairs,
    stairUpgradeType: sub.stair_upgrade_type,
    additionalWindowsQty: sub.additional_windows_qty,
    patioDoorsQty: sub.patio_doors_qty,
    automatedWindowsQty: sub.automated_windows_qty,
    bathroomTileSelected: sub.bathroom_tile_selected,
    bathroomTileEnsuiteSelected: sub.bathroom_tile_ensuite_selected,
    bathroomTileGuestSelected: sub.bathroom_tile_guest_selected,
    heatedFloorBathrooms: sub.heated_floor_bathrooms,
    customTiledShower: sub.custom_tiled_shower,
    bedroomFlooringChoice: sub.bedroom_flooring_choice,
    bedroomPremiumCarpetSelected: !!sub.premium_carpet_bedroom,
    bedroomPremiumUnderpadSelected: !!sub.premium_underpad_bedroom,
    customPricing: sub.custom_pricing,
  }, serverPricing);
  const lines = generateQuoteLines({ selections, unitTypeCode: code, pricing: serverPricing, baseSpec: baseSpecFor(code) });
  return { client, server, lines };
}

const counted = (lines: QuoteLine[]) => lines.filter((l) => l.status === 'upgrade' && l.amount != null);

/**
 * Bijection between engine line items and counted generated lines by amount (±0.005).
 * Zero-amount counted lines may stay unmatched: the server engine drops $0 area rows and neither engine lists an
 * explicit $0 override, while the generator keeps them as $0 lines (sum unaffected).
 */
function matchLines(engineAmounts: number[], lines: QuoteLine[]): { unmatchedEngine: number[]; unmatchedLines: QuoteLine[] } {
  const pool = [...counted(lines)];
  const unmatchedEngine: number[] = [];
  for (const amt of engineAmounts) {
    const i = pool.findIndex((l) => Math.abs((l.amount as number) - amt) < 0.005);
    if (i < 0) unmatchedEngine.push(amt); else pool.splice(i, 1);
  }
  return { unmatchedEngine, unmatchedLines: pool.filter((l) => Math.abs(l.amount as number) >= 0.005) };
}

test('fixture holds all nine live submissions', () => {
  expect(rows.length).toBe(9);
});

describe('generateQuoteLines parity with both engines', () => {
  for (const row of rows) {
    const unit = row.unit_number;
    test(`Unit ${unit}: subtotal to the cent = client engine = server engine = pin`, () => {
      const { client, server, lines } = engines(row);
      const sum = sumQuoteLines(lines, 0.05);
      expect(EXPECTED_SUBTOTALS[unit]).toBeDefined();
      expect(sum.subtotal.toFixed(2)).toBe(EXPECTED_SUBTOTALS[unit].toFixed(2));
      expect(sum.subtotal.toFixed(2)).toBe(client.grandSubtotal.toFixed(2));
      expect(sum.subtotal.toFixed(2)).toBe(server.grandSubtotal.toFixed(2));
      expect(sum.windowCoverings.toFixed(2)).toBe(client.windowSubtotal.toFixed(2));
      expect(sum.windowCoverings.toFixed(2)).toBe(server.windowSubtotal.toFixed(2));
      expect(sum.upgrades.toFixed(2)).toBe(client.upgradesSubtotal.toFixed(2));
      expect(sum.gst.toFixed(2)).toBe(client.gst.toFixed(2));
      expect(sum.total.toFixed(2)).toBe(client.grandTotal.toFixed(2));
    });

    test(`Unit ${unit}: line for line against client lineItems`, () => {
      const { client, lines } = engines(row);
      // Window lineItems are aggregates (qty × price); the generator emits one line per opening, so compare
      // non-window items one-to-one and window items by group total.
      const nonWindow = client.lineItems.filter((li) => li.group !== 'window');
      const linesNonWindow = lines.filter((l) => l.section !== 'window_coverings');
      const { unmatchedEngine, unmatchedLines } = matchLines(nonWindow.map((li) => li.amount), linesNonWindow);
      expect(unmatchedEngine).toEqual([]);
      expect(unmatchedLines.map((l) => `${l.location}/${l.label}=${l.amount}`)).toEqual([]);
      // Zero-amount client lineItems (an area row priced at $0) must also exist as a counted $0 line.
      const zeroEngine = nonWindow.filter((li) => li.amount === 0).length;
      const zeroLines = counted(linesNonWindow).filter((l) => l.amount === 0 && l.pricing_mode !== 'manual').length;
      expect(zeroLines).toBe(zeroEngine);
    });

    test(`Unit ${unit}: line for line against server lineItems`, () => {
      const { server, lines } = engines(row);
      const nonWindow = server.lineItems.filter((li) => li.group !== 'window');
      const { unmatchedEngine, unmatchedLines } = matchLines(nonWindow.map((li) => li.amount),
        lines.filter((l) => l.section !== 'window_coverings'));
      expect(unmatchedEngine).toEqual([]);
      expect(unmatchedLines.map((l) => `${l.location}/${l.label}=${l.amount}`)).toEqual([]);
    });

    test(`Unit ${unit}: window lines reproduce each window lineItem (per-opening lines sum to the item)`, () => {
      const { client, server, lines } = engines(row);
      const win = counted(lines).filter((l) => l.section === 'window_coverings');
      const byField = (f: string) => win.filter((l) => l.wizard_field === f).reduce((t, l) => t + (l.amount as number), 0);
      expect(byField('additional_windows_qty')).toBeCloseTo(client.pieces.windowAdditional, 2);
      expect(byField('patio_doors_qty')).toBeCloseTo(client.pieces.windowPatio, 2);
      expect(byField('automated_windows_qty')).toBeCloseTo(client.pieces.windowAutomation, 2);
      expect(byField('additional_windows_qty')).toBeCloseTo(server.pieces.windowAdditional, 2);
      expect(byField('patio_doors_qty')).toBeCloseTo(server.pieces.windowPatio, 2);
      expect(byField('automated_windows_qty')).toBeCloseTo(server.pieces.windowAutomation, 2);
      // One line per opening, quantity 1, unit 'each'.
      for (const l of win) { expect(l.quantity).toBe(1); expect(l.unit).toBe('each'); }
      expect(win.filter((l) => l.wizard_field === 'patio_doors_qty')).toHaveLength(row.patio_doors_qty || 0);
      expect(win.filter((l) => l.wizard_field === 'automated_windows_qty')).toHaveLength(row.automated_windows_qty || 0);
    });

    test(`Unit ${unit}: office items map one-to-one with engine includedItems and uncommittedItems`, () => {
      const { client, lines } = engines(row);
      const office = lines.filter((l) => l.source === 'office');
      expect(office.filter((l) => l.status === 'included')).toHaveLength(client.pieces.includedItems.length);
      const notCounted = office.filter((l) => l.status !== 'included' && !(l.status === 'upgrade' && l.amount != null));
      expect(notCounted.map((l) => l.amount)).toEqual(client.pieces.uncommittedItems.map((i) => i.amount));
    });

    test(`Unit ${unit}: vocabulary — no removed, valid enums, included lines at $0`, () => {
      const { lines } = engines(row);
      for (const l of lines) {
        expect(['included', 'upgrade', 'pending', 'under_review', 'deferred']).toContain(l.status);
        expect(['standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other']).toContain(l.section);
        expect(['sqft', 'sqyd', 'each', 'flat']).toContain(l.unit);
        expect(['catalog', 'flat_rate', 'manual', 'included']).toContain(l.pricing_mode);
        if (l.status === 'included') { expect(l.amount).toBe(0); expect(l.pricing_mode).toBe('included'); }
        if (l.status === 'pending') expect(l.amount).toBeNull();
        expect(l.label.trim().length).toBeGreaterThan(0);
        expect(l.label).not.toContain('Master Bedroom');
        expect(l.location).not.toContain('Master Bedroom');
      }
      const orders = lines.map((l) => l.sort_order);
      expect([...orders].sort((a, b) => a - b)).toEqual(orders);
      expect(new Set(orders).size).toBe(orders.length);
    });

    test(`Unit ${unit}: deterministic`, () => {
      expect(JSON.stringify(engines(row).lines)).toBe(JSON.stringify(engines(row).lines));
    });
  }
});

test('shared module has zero imports and no runtime globals', () => {
  const src = readFileSync(join(import.meta.dir, '../supabase/functions/_shared/quoteLines.ts'), 'utf8');
  expect(src).not.toMatch(/^\s*import\s/m);
  expect(src).not.toMatch(/\brequire\(/);
  expect(src).not.toMatch(/\bDeno\./);
  expect(src).not.toMatch(/\bprocess\./);
  expect(src).not.toMatch(/\bwindow\./);
});

test('app re-export resolves to the same module', () => {
  const src = readFileSync(join(import.meta.dir, '../src/lib/quoteLines.ts'), 'utf8').trim();
  expect(src).toContain("export * from '@shared/quoteLines'");
});
