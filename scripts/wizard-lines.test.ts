// Phase 2 Task 9: the wizard's running total and located windows. The lines the buyer sees in the rail are generated
// from in-progress wizard state through the same row mapping the server uses after the insert, so the server's
// regenerated lines equal the client's (fixture round-trip below).
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import liveSubmissions from './fixtures/live-submissions.json';
import pricingSnapshot from './fixtures/pricing-snapshot.json';
import type { PricingSnapshot } from './lib/fixturePricing';
import { enginePricingFromRows, type SubmissionRow } from './lib/generateInputFromRow';
import { generateBaseSpecTs } from './gen-base-spec-sql';
import {
  generateQuoteLines, sumQuoteLines, windowCounts, type QuoteLine, type QuoteWindow,
} from '../supabase/functions/_shared/quoteLines.ts';
import { validateWizardWindows, MAX_WIZARD_WINDOWS } from '../supabase/functions/_shared/wizardWindows.ts';
import { baseSpecForCode } from '../supabase/functions/_shared/baseSpecData.ts';
import { wizardSubmissionLines, subtotalParityLog } from '../supabase/functions/_shared/wizardSubmissionLines.ts';
import {
  buildGenerateInputFromRow, quotePricingFromRows, wizardQuoteLines, wizardSelectionsToRow, wizardSubmitBody,
} from '../src/lib/generateInputFromSelections';
import { migrateDraftWindows, synthesizeWindows } from '../src/lib/draftWindows';
import { BASE_SPEC, baseSpecFor, includedShadeLocations, WINDOW_LOCATION_PRESETS } from '../src/lib/baseSpec';
import { toBuyerPdfSelections } from '../src/lib/buyerPdfSelections';

const root = join(import.meta.dir, '..');
const snapshot = pricingSnapshot as unknown as PricingSnapshot;
const pricing = enginePricingFromRows(snapshot).serverPricing;
const cfg = (k: string) => Number(snapshot.pricing_config.find((c) => c.config_key === k)!.config_value);
const rows = liveSubmissions as unknown as SubmissionRow[];

let n = 0;
const id = () => `t${++n}`;

/** A Type C wizard state shaped like SelectionWizard's SelectionState (in-progress, unsaved). */
function typeCWizard(windows: QuoteWindow[]) {
  return {
    unitNumber: '24', firstName: 'Test', lastName: 'Buyer', phoneNumber: '204-555-0100', email: 'buyer@example.com',
    estimatedPossessionDate: '2027-03-01', hasStairs: true, lvpColour: 'wolf-river', lvpComments: '',
    spcTileColour: 'pezzo', spcTileComments: '', backsplashOrientation: 'stacked', stairCarpetColour: 'sawgrass-701',
    stairLvpUpgradeSelected: false, stairUpgradeType: 'standard', bedroomFlooringChoice: 'carpet',
    bedroomCarpetColour: 'sawgrass-701', premiumCarpetBedroom: true, premiumUnderpadBedroom: true,
    premiumUnderpadStairs: false, stairPremiumCarpetSelected: true, bedroomLvpColour: '', bedroomLvpSameAsMain: true,
    ...windowCounts(windows), windows: windows.map((w) => ({ id: id(), ...w })),
    windowComments: 'Blackout in the den please', salesComments: 'internal', upgradeInterests: { automation: true },
    upgradeInterestsNotes: '', areaUpgrades: [
      { areaId: 'mainLiving', materialType: 'lvp', productName: 'Premium LVP', productColor: 'Oak', comments: '', clientComment: 'Matte', heatedFloor: false },
      { areaId: 'masterEnsuite', materialType: 'tile', productName: 'Porcelain', productColor: 'Grey', comments: '', heatedFloor: true },
    ],
    upgradeFloorSelection: null, backsplashGrout: { enabled: true, groutColor: 'Charcoal', comments: 'dark' },
    upgradeComments: '', bathroomTileSelected: false, bathroomTileEnsuiteSelected: false, bathroomTileGuestSelected: false,
    heatedFloorBathrooms: 0, customTiledShower: true, documentUploads: [],
  };
}
const UNIT_C = { unitType: 'Corner Unit C' };
const LOCATED: QuoteWindow[] = [
  { location: 'Main Living', kind: 'roller_5', motorized: true },
  { location: 'Kitchen', kind: 'roller_1', motorized: false },
  { location: 'Patio Door', kind: 'panel_track', motorized: true },
  { location: 'Primary Bedroom', kind: 'included', motorized: true },
];
const win = (ls: QuoteLine[]) => ls.filter((l) => l.section === 'window_coverings');

describe('generator: located windows', () => {
  const lines = wizardQuoteLines(typeCWizard(LOCATED), UNIT_C, pricing);
  const openings = win(lines).filter((l) => l.status === 'upgrade' && l.label !== 'Somfy motorization');
  const motors = win(lines).filter((l) => l.label === 'Somfy motorization');

  test('one window_coverings line per located opening, unit_price from pricing_config, quantity 1', () => {
    expect(openings.map((l) => [l.location, l.product_name, l.unit_price, l.quantity, l.unit])).toEqual([
      ['Main Living', 'Roller shade 5%', cfg('additional_window_price'), 1, 'each'],
      ['Kitchen', 'Roller shade 1%', cfg('additional_window_price'), 1, 'each'],
      ['Patio Door', 'Sliding panel track', cfg('patio_door_price'), 1, 'each'],
    ]);
    for (const l of openings) expect(l.amount).toBe(l.unit_price);
    expect(openings.map((l) => l.price_source_ref)).toEqual(['config:additional_window_price', 'config:additional_window_price', 'config:patio_door_price']);
  });

  test('one Somfy motorization line per motorized row, at that row\'s location', () => {
    expect(motors.map((l) => [l.location, l.unit_price, l.amount])).toEqual([
      ['Main Living', cfg('automated_motor_price'), cfg('automated_motor_price')],
      ['Patio Door', cfg('automated_motor_price'), cfg('automated_motor_price')],
      ['Primary Bedroom', cfg('automated_motor_price'), cfg('automated_motor_price')],
    ]);
  });

  test('included bedroom shades are present at $0 (Type C: both bedrooms)', () => {
    const inc = win(lines).filter((l) => l.status === 'included');
    expect(inc.map((l) => [l.location, l.amount, l.pricing_mode])).toEqual([
      ['Primary Bedroom', 0, 'included'], ['Second Bedroom', 0, 'included'],
    ]);
  });

  test('window amounts equal the integer path (the list changes locations only)', () => {
    const counts = windowCounts(LOCATED);
    const sel = { ...typeCWizard(LOCATED), windows: [] as QuoteWindow[] };
    const row = wizardSelectionsToRow(sel, UNIT_C);
    Object.assign(row, { additional_windows_qty: counts.additionalWindowsQty, patio_doors_qty: counts.patioDoorsQty, automated_windows_qty: counts.automatedWindowsQty });
    const generic = generateQuoteLines(buildGenerateInputFromRow(row, pricing));
    expect(sumQuoteLines(lines, 0.05)).toEqual({ ...sumQuoteLines(generic, 0.05), notInTotal: sumQuoteLines(lines, 0.05).notInTotal });
    expect(sumQuoteLines(lines, 0.05).windowCoverings).toBe(
      2 * cfg('additional_window_price') + cfg('patio_door_price') + 3 * cfg('automated_motor_price'));
  });

  test('a list whose counts disagree with the integers is ignored (generic locations, same amounts)', () => {
    const row = wizardSelectionsToRow(typeCWizard(LOCATED), UNIT_C);
    const bad = generateQuoteLines(buildGenerateInputFromRow({ ...row, patio_doors_qty: 3 }, pricing, { windows: LOCATED }));
    expect(win(bad).filter((l) => l.label === 'Patio door panel track').map((l) => l.location)).toEqual(['Patio Door 1', 'Patio Door 2', 'Patio Door 3']);
  });

  test('derived integer columns equal the list counts and are written to the row', () => {
    const row = wizardSelectionsToRow(typeCWizard(LOCATED), UNIT_C);
    expect([row.additional_windows_qty, row.patio_doors_qty, row.automated_windows_qty]).toEqual([2, 1, 3]);
    // Stale integers in state never win over the list.
    const stale = { ...typeCWizard(LOCATED), additionalWindowsQty: 9, patioDoorsQty: 9, automatedWindowsQty: 9 };
    const body = wizardSubmitBody(stale, UNIT_C);
    expect([body.additionalWindowsQty, body.patioDoorsQty, body.automatedWindowsQty]).toEqual([2, 1, 3]);
    expect(body.windows).toEqual(LOCATED);
  });
});

describe('round trip: client lines == server-regenerated lines (Type C fixture)', () => {
  const sel = typeCWizard(LOCATED);
  const client = wizardQuoteLines(sel, UNIT_C, pricing);
  const wire = JSON.parse(JSON.stringify(wizardSubmitBody(sel, UNIT_C, { subtotal: sumQuoteLines(client, 0.05).subtotal })));

  test('wizardSelectionsToRow → generateInputFromRow → lines equal the client lines', () => {
    const row = wizardSelectionsToRow(sel, UNIT_C);
    expect(generateQuoteLines(buildGenerateInputFromRow(row, pricing, { windows: wire.windows }))).toEqual(client);
  });

  test('the edge path (saved row + validated windows + edge base-spec mirror) gives the same lines', () => {
    // What PostgREST returns from the insert: the payload plus DB defaults.
    const saved = { ...wizardSelectionsToRow(sel, UNIT_C), id: 'sub-1', custom_pricing: null, created_at: '2026-11-18T00:00:00Z' };
    const server = wizardSubmissionLines(saved, wire.windows, pricing);
    expect(server.windowsRejected).toBeNull();
    const strip = (ls: QuoteLine[]) => ls.map(({ submission_id: _s, ...l }) => l);
    expect(strip(server.lines)).toEqual(client);
    expect(server.inserts.every((l) => l.submission_id === 'sub-1' && l.source === 'wizard' && !('id' in l))).toBe(true);
    expect(server.subtotal).toBe(sumQuoteLines(client, 0.05).subtotal);
    expect(subtotalParityLog('sub-1', wire.subtotal, server.subtotal)).toContain(' match');
    expect(subtotalParityLog('sub-1', 1, server.subtotal)).toContain('MISMATCH');
  });

  test('client lines carry no submission id and are all wizard/office sourced', () => {
    expect(client.every((l) => l.submission_id === undefined && l.source === 'wizard')).toBe(true);
  });

  test('pricing built from the hook rows equals the edge loader result', () => {
    const fromHook = quotePricingFromRows({
      config: snapshot.pricing_config, materials: snapshot.upgrade_materials.filter((m) => m.is_active), unitAreas: snapshot.unit_area_data,
    });
    expect(fromHook).toEqual(pricing);
  });
});

describe('row mapping parity on every live fixture', () => {
  for (const row of rows) {
    test(`Unit ${row.unit_number}: shared row mapping == toBuyerPdfSelections mapping, line for line`, () => {
      const viaShared = generateQuoteLines(buildGenerateInputFromRow(row, pricing));
      const viaPdf = generateQuoteLines({ ...buildGenerateInputFromRow(row, pricing), selections: toBuyerPdfSelections(row) });
      expect(viaShared).toEqual(viaPdf);
    });
  }
});

describe('server windows validation', () => {
  test('absent → null; valid rows trimmed and capped at 80 chars', () => {
    expect(validateWizardWindows(undefined)).toEqual({ ok: true, windows: null });
    const long = 'x'.repeat(120);
    expect(validateWizardWindows([{ location: `  ${long}  `, kind: 'roller_1', motorized: 'yes', extra: 1 }]))
      .toEqual({ ok: true, windows: [{ location: 'x'.repeat(80), kind: 'roller_1', motorized: false }] });
  });
  test('rejects non-arrays, too many rows, unknown kinds and non-string locations', () => {
    expect(validateWizardWindows('x').ok).toBe(false);
    expect(validateWizardWindows(Array.from({ length: MAX_WIZARD_WINDOWS + 1 }, () => ({ location: 'a', kind: 'roller_5' }))).ok).toBe(false);
    expect(validateWizardWindows([{ location: 'a', kind: 'blind' }]).ok).toBe(false);
    expect(validateWizardWindows([{ location: 5, kind: 'roller_5' }]).ok).toBe(false);
  });
  test('a rejected list falls back to generic locations on the server, amounts unchanged', () => {
    const sel = typeCWizard(LOCATED);
    const saved = { ...wizardSelectionsToRow(sel, UNIT_C), id: 'sub-2' };
    const ok = wizardSubmissionLines(saved, toWire(LOCATED), pricing);
    const rejected = wizardSubmissionLines(saved, [{ location: 'a', kind: 'blind' }], pricing);
    expect(rejected.windowsRejected).toContain('kind');
    expect(rejected.subtotal).toBe(ok.subtotal);
    expect(win(rejected.lines).some((l) => l.location === 'Additional Window 1')).toBe(true);
  });
});
const toWire = (ws: QuoteWindow[]) => JSON.parse(JSON.stringify(ws));

describe('old drafts: integer-only windows are migrated to rows', () => {
  const ids = () => { let i = 0; return () => `d${++i}`; };

  test('synthesises generic rows; derived integers equal the old integers', () => {
    const draft = { unitNumber: '24', additionalWindowsQty: 2, patioDoorsQty: 1, automatedWindowsQty: 2 };
    const out = migrateDraftWindows(draft, ['Primary Bedroom'], ids());
    expect(out.windows).toEqual([
      { id: 'd2', location: 'Additional Window 1', kind: 'roller_5', motorized: true },
      { id: 'd3', location: 'Additional Window 2', kind: 'roller_5', motorized: false },
      { id: 'd1', location: 'Patio Door', kind: 'panel_track', motorized: true },
    ]);
    expect(windowCounts(out.windows)).toEqual({ additionalWindowsQty: 2, patioDoorsQty: 1, automatedWindowsQty: 2 });
    expect([out.additionalWindowsQty, out.patioDoorsQty, out.automatedWindowsQty]).toEqual([2, 1, 2]);
  });

  test('motors beyond the openings land on included bedroom shades, then generic openings — none are lost', () => {
    const out = synthesizeWindows({ additionalWindowsQty: 0, patioDoorsQty: 1, automatedWindowsQty: 4 }, ['Primary Bedroom', 'Second Bedroom'], ids());
    expect(out.map((w) => [w.location, w.kind, w.motorized])).toEqual([
      ['Patio Door', 'panel_track', true], ['Primary Bedroom', 'included', true], ['Second Bedroom', 'included', true],
      ['Motorized Opening 4', 'included', true],
    ]);
    expect(windowCounts(out).automatedWindowsQty).toBe(4);
  });

  test('migrated draft prices the same as the integer-only draft did', () => {
    const counts = { additionalWindowsQty: 1, patioDoorsQty: 2, automatedWindowsQty: 2 };
    const legacy = { ...typeCWizard([]), ...counts, windows: undefined };
    const migrated = migrateDraftWindows(legacy, includedShadeLocations('C'), ids());
    const before = generateQuoteLines(buildGenerateInputFromRow({ ...wizardSelectionsToRow({ ...legacy, windows: [] }, UNIT_C),
      additional_windows_qty: 1, patio_doors_qty: 2, automated_windows_qty: 2 }, pricing));
    const after = wizardQuoteLines(migrated, UNIT_C, pricing);
    expect(sumQuoteLines(after, 0.05).subtotal).toBe(sumQuoteLines(before, 0.05).subtotal);
    // Same generic names the generator uses, so the located lines read the same as before.
    const key = (ls: QuoteLine[]) => win(ls).map((l) => `${l.location}/${l.label}`).sort();
    expect(key(after)).toEqual(key(before));
  });

  test('a draft that already has windows keeps them (idempotent) and drops junk rows', () => {
    const rowsIn = [{ id: 'a', location: 'Dining', kind: 'roller_1', motorized: true }, null, { location: 'Den', kind: 'nope' }];
    const out = migrateDraftWindows({ additionalWindowsQty: 7, windows: rowsIn }, [], ids());
    expect(out.windows).toEqual([
      { id: 'a', location: 'Dining', kind: 'roller_1', motorized: true },
      { id: 'd1', location: 'Den', kind: 'roller_5', motorized: false },
    ]);
    expect(out.additionalWindowsQty).toBe(2);
    expect(migrateDraftWindows(out, [], ids())).toEqual(out);
  });
});

describe('base spec: window presets and the edge mirror', () => {
  test('_shared/baseSpecData.ts is byte-identical to the generator output', () => {
    const file = readFileSync(join(root, 'supabase/functions/_shared/baseSpecData.ts'), 'utf8');
    expect(file).toBe(generateBaseSpecTs());
  });
  test('baseSpecForCode (edge) == baseSpecFor (src) for every type and alias', () => {
    for (const code of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'G-1', 'H-2', 'J', 'Corner Unit C', 'Mid Unit J', 'Z', null]) {
      expect(baseSpecForCode(code)).toEqual(baseSpecFor(code));
    }
    expect(BASE_SPEC.length).toBeGreaterThan(0);
  });
  test('presets: bedrooms come from the base spec; others from the one constant, without prices', () => {
    expect(includedShadeLocations('C')).toEqual(['Primary Bedroom', 'Second Bedroom']);
    expect(includedShadeLocations('G')).toEqual(['Primary Bedroom']);
    expect(WINDOW_LOCATION_PRESETS).toEqual(['Main Living', 'Kitchen', 'Dining', 'Front Entrance', 'Patio Door']);
    expect(WINDOW_LOCATION_PRESETS.some((p) => /\$|\d/.test(p))).toBe(false);
  });
});
describe('wizard source guards', () => {
  const wizard = readFileSync(join(root, 'src/pages/SelectionWizard.tsx'), 'utf8');
  test('the wizard renders totals only through RunningTotal (no UpgradePricingSummary, no own subtotal math)', () => {
    expect(wizard).not.toContain('UpgradePricingSummary');
    expect(wizard).toContain('<RunningTotal');
    expect(wizard).not.toMatch(/additionalWindowsQty\s*\*\s*additionalWindowPrice/);
  });
  test('lines regenerate from in-progress selections with useMemo', () => {
    expect(wizard).toMatch(/useMemo\(\s*\(\)\s*=>\s*wizardQuoteLines\(/);
  });
  test('no hard-coded dollar amounts in the wizard', () => {
    expect(wizard).not.toMatch(/\$\d[\d,]*\.\d\d/);
  });
});

describe('Windows step and rail shell render', () => {
  test('LocatedWindowsList: bedrooms read-only "Included", one row per window, Add another', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LocatedWindowsList } = await import('../src/components/buyer/LocatedWindowsList');
    const html = renderToStaticMarkup(createElement(LocatedWindowsList, {
      windows: [{ id: 'a', location: 'Den', kind: 'roller_1', motorized: true }, { id: 'b', location: 'Patio Door', kind: 'panel_track', motorized: false }],
      onChange: () => undefined,
      included: [{ location: 'Primary Bedroom', product: 'Graber blackout shade' }, { location: 'Second Bedroom', product: 'Graber blackout shade' }],
      prices: { window: 1, patioDoor: 2, motor: 3 },
    }));
    expect(html.match(/Included</g)?.length).toBe(2);
    expect(html).toContain('Primary Bedroom');
    expect(html).toContain('value="Den"'); // typed (non-preset) location shows its text box
    expect(html).toContain('Remove window 2');
    expect(html).toContain('Add another window');
  });
  test('StepContainer is a two-column shell only when a rail is provided', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StepContainer } = await import('../src/components/StepContainer');
    const { StepRailContext } = await import('../src/components/stepRail');
    const plain = renderToStaticMarkup(createElement(StepContainer, { title: 'T', children: 'body' }));
    expect(plain).not.toContain('lg:grid-cols');
    const withRail = renderToStaticMarkup(createElement(StepRailContext.Provider, { value: createElement('aside', null, 'rail') },
      createElement(StepContainer, { title: 'T', children: 'body' })));
    expect(withRail).toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
    expect(withRail).toContain('<aside>rail</aside>');
  });
});
