import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_SPEC, baseSpecFor, LAUNDRY_DEFAULT_PRODUCT, DANTE_PRODUCT } from '../src/lib/baseSpec';
import { LAUNDRY_STANDARD_LABEL } from '../src/lib/outputLabels';
import { generateBaseSpecSql } from './gen-base-spec-sql';

const root = join(import.meta.dir, '..');
const snapshot = JSON.parse(readFileSync(join(root, 'scripts/fixtures/pricing-snapshot.json'), 'utf8')) as {
  unit_area_data: Array<Record<string, unknown> & { unit_type_code: string }>;
};
const SECTIONS = ['standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other'];
const logical = (code: string) => code.replace(/-[12]$/, '');
const LOGICAL_TYPES = [...new Set(snapshot.unit_area_data.map((r) => logical(r.unit_type_code)))];

describe('BASE_SPEC', () => {
  test('every logical unit type in the pricing snapshot has enough rows', () => {
    expect(LOGICAL_TYPES.sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']);
    for (const t of LOGICAL_TYPES) {
      expect(baseSpecFor(t).length, `rows for ${t}`).toBeGreaterThanOrEqual(8);
    }
  });

  test('Type C has exactly one Primary Bedroom flooring row and one Stairs to Lower Level row', () => {
    const c = baseSpecFor('C');
    expect(c.filter((r) => r.location === 'Primary Bedroom' && r.section === 'flooring')).toHaveLength(1);
    expect(c.filter((r) => r.location === 'Stairs to Lower Level')).toHaveLength(1);
  });

  test('no empty labels and every section is in the quote_lines vocabulary', () => {
    for (const r of BASE_SPEC) {
      expect(r.label.trim().length).toBeGreaterThan(0);
      expect(SECTIONS).toContain(r.section);
    }
  });

  test('baseSpecFor normalizes G-1 / G-2 / labels to the logical type', () => {
    expect(baseSpecFor('G-1')).toEqual(baseSpecFor('G'));
    expect(baseSpecFor('G-2')).toEqual(baseSpecFor('G'));
    expect(baseSpecFor('Corner Unit H-2')).toEqual(baseSpecFor('H'));
    expect(baseSpecFor('Unit Type A')).toEqual(baseSpecFor('A'));
    expect(baseSpecFor('Z')).toEqual([]);
  });

  test('laundry, second bedroom and ensuite rows follow unit_area_data', () => {
    for (const t of LOGICAL_TYPES) {
      const rows = snapshot.unit_area_data.filter((r) => logical(r.unit_type_code) === t);
      const any = (k: string) => rows.some((r) => Number(r[k]) > 0);
      const spec = baseSpecFor(t);
      const has = (loc: string) => spec.some((r) => r.location === loc && r.section !== 'window_coverings');
      expect(has('Laundry Room'), `${t} laundry`).toBe(any('laundry'));
      expect(has('Second Bedroom'), `${t} second bedroom`).toBe(any('second_bedroom'));
      expect(has('Primary Ensuite'), `${t} ensuite`).toBe(any('master_ensuite'));
      expect(has('Main Bathroom'), `${t} bathroom`).toBe(true);
      expect(spec.filter((r) => r.location === 'Stairs to Second Floor').length, `${t} 2nd floor stairs`).toBe(t === 'G' || t === 'H' ? 1 : 0);
      expect(spec.filter((r) => r.location === 'Stairs to Lower Level')).toHaveLength(1);
      const shades = spec.filter((r) => r.section === 'window_coverings');
      expect(shades.length).toBe(1 + (any('second_bedroom') ? 1 : 0));
      for (const s of shades) expect(s.defaultProduct).toBe('Graber blackout shade');
      expect(spec.filter((r) => r.section === 'backsplash')).toHaveLength(1);
      const basement = spec.filter((r) => r.section === 'basement');
      expect(basement).toHaveLength(1);
      expect(basement[0].isIncluded).toBe(false);
      expect(basement[0].label).toBe('Unfinished — pricing not released');
    }
  });

  test('A and B have no laundry row; G and H have no second bedroom', () => {
    for (const t of ['A', 'B']) expect(baseSpecFor(t).some((r) => r.location === 'Laundry Room')).toBe(false);
    for (const t of ['G', 'H']) expect(baseSpecFor(t).some((r) => r.location === 'Second Bedroom')).toBe(false);
  });

  test('products and colour options match the brief on every row of every type', () => {
    const LVP = ['Cortland', 'Opal', 'Wolf River'];
    const DANTE = ['Pezzo', 'Piccolo', 'Venatino'];
    const LUXOR = ['Winterbrooke 898', 'Midnight Shadow 427', 'Jet Stream 200', 'Sawgrass 701'];
    const BED = 'LVP or Luxor I carpet + standard underpad';
    expect(DANTE_PRODUCT).toBe('Ceratec Dante 2.0');
    const expected: Record<string, [string | null, string[]]> = {
      'flooring|Main Living': ['XL Flooring LVP', LVP],
      'tile|Main Bathroom': [DANTE_PRODUCT, DANTE],
      'tile|Primary Ensuite': [DANTE_PRODUCT, DANTE],
      'flooring|Laundry Room': [LAUNDRY_DEFAULT_PRODUCT, DANTE],
      'flooring|Primary Bedroom': [BED, LUXOR],
      'flooring|Second Bedroom': [BED, LUXOR],
      'stairs|Stairs to Second Floor': ['Standard carpet + underpad', LUXOR],
      'stairs|Stairs to Lower Level': ['Standard carpet + underpad', LUXOR],
      'backsplash|Kitchen': ['3×8 subway tile', []],
      'window_coverings|Primary Bedroom': ['Graber blackout shade', []],
      'window_coverings|Second Bedroom': ['Graber blackout shade', []],
      'basement|Basement': [null, []],
    };
    for (const r of BASE_SPEC) {
      const e = expected[`${r.section}|${r.location}`];
      expect(e, `${r.unitTypeCode} ${r.section}|${r.location} is a known row`).toBeDefined();
      expect(r.defaultProduct, `${r.unitTypeCode} ${r.location} product`).toBe(e[0]);
      expect(r.defaultColourOptions, `${r.unitTypeCode} ${r.location} colours`).toEqual(e[1]);
    }
  });

  test('laundry default product agrees with the buyer-facing standard label', () => {
    expect(LAUNDRY_DEFAULT_PRODUCT).toBe('Ceratec Dante 2.0 LVT');
    expect(LAUNDRY_STANDARD_LABEL.startsWith(LAUNDRY_DEFAULT_PRODUCT)).toBe(true);
  });

  test('no prices are hardcoded in the seed', () => {
    expect(JSON.stringify(BASE_SPEC)).not.toMatch(/price|\$\s?\d/i);
  });
});

describe('migration 0007', () => {
  const sqlPath = join(root, 'drizzle/migrations/0007_seed_unit_base_spec.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  test('SQL file is byte-equal to generator output', () => {
    expect(sql).toBe(generateBaseSpecSql());
  });

  test('row count equals BASE_SPEC.length and inserts are idempotent', () => {
    const tuples = sql.split('\n').filter((l) => l.startsWith("  ('"));
    expect(tuples).toHaveLength(BASE_SPEC.length);
    expect(sql).toMatch(/ON CONFLICT \(unit_type_code, section, location, label\) DO NOTHING;/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS unit_base_spec_natural_key/);
  });

  test('journal and snapshot chain 0006 -> 0007', () => {
    const journal = JSON.parse(readFileSync(join(root, 'drizzle/migrations/meta/_journal.json'), 'utf8'));
    const e6 = journal.entries.find((e: { idx: number }) => e.idx === 6);
    const e7 = journal.entries.find((e: { idx: number }) => e.idx === 7);
    expect(e7.tag).toBe('0007_seed_unit_base_spec');
    expect(e7.when).toBeGreaterThan(e6.when);
    const s6 = JSON.parse(readFileSync(join(root, 'drizzle/migrations/meta/0006_snapshot.json'), 'utf8'));
    const s7 = JSON.parse(readFileSync(join(root, 'drizzle/migrations/meta/0007_snapshot.json'), 'utf8'));
    expect(s7.prevId).toBe(s6.id);
    expect(s7.id).not.toBe(s6.id);
    expect(s7.tables).toEqual({});
  });
});
