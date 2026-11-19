import { describe, expect, test } from 'bun:test';
import { rankQuotes, readRecents, pushRecent, type QuoteRow, type StorageLike } from '../src/lib/quoteSearch';

const row = (o: Partial<QuoteRow> & { id: string }): QuoteRow => ({
  unit_number: '100', first_name: 'A', last_name: 'B', email: 'a@b.com', status: 'submitted',
  updated_at: '2026-01-01T00:00:00Z', ...o,
});

function mem(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('recentQuotes', initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('rankQuotes', () => {
  const rows = [
    row({ id: 'email', unit_number: '900', last_name: 'Zed', email: 'smith.fan@x.com' }),
    row({ id: 'last', unit_number: '901', last_name: 'Smithson', email: 'q@x.com' }),
    row({ id: 'unit', unit_number: '305', last_name: 'Other', email: 'o@x.com' }),
  ];

  test('exact unit beats last-name prefix beats email contains', () => {
    expect(rankQuotes(rows, '305', []).map((r) => r.id)).toEqual(['unit']);
    const r2 = [
      row({ id: 'email', unit_number: '1', last_name: 'Zed', email: 'smith@x.com' }),
      row({ id: 'last', unit_number: '2', last_name: 'Smithson' }),
      row({ id: 'unit', unit_number: 'smith', last_name: 'Q' }),
    ];
    expect(rankQuotes(r2, 'smith', []).map((r) => r.id)).toEqual(['unit', 'last', 'email']);
  });

  test('partial unit prefix and last-name prefix match; non-matches drop', () => {
    const ids = rankQuotes(rows, '90', []).map((r) => r.id).sort();
    expect(ids).toEqual(['email', 'last']);
    expect(rankQuotes(rows, 'smi', []).map((r) => r.id)).toEqual(['last', 'email']);
    expect(rankQuotes(rows, 'nomatch', [])).toEqual([]);
  });

  test('is case-insensitive', () => {
    expect(rankQuotes(rows, 'SMITHSON', []).map((r) => r.id)).toEqual(['last']);
  });

  test('multi-token scores sum', () => {
    const r = [
      row({ id: 'both', unit_number: '305', last_name: 'Smith' }),
      row({ id: 'unitOnly', unit_number: '305', last_name: 'Jones' }),
      row({ id: 'nameOnly', unit_number: '777', last_name: 'Smith' }),
    ];
    expect(rankQuotes(r, '305 smith', []).map((x) => x.id)).toEqual(['both', 'unitOnly', 'nameOnly']);
  });

  test('ties break by updated_at desc', () => {
    const r = [
      row({ id: 'old', last_name: 'Lee', updated_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'new', last_name: 'Lee', updated_at: '2026-03-01T00:00:00Z' }),
    ];
    expect(rankQuotes(r, 'lee', []).map((x) => x.id)).toEqual(['new', 'old']);
  });

  test('empty query: recents first in recency order (present only), then updated_at desc', () => {
    const r = [
      row({ id: 'a', updated_at: '2026-01-01T00:00:00Z' }),
      row({ id: 'b', updated_at: '2026-02-01T00:00:00Z' }),
      row({ id: 'c', updated_at: '2026-03-01T00:00:00Z' }),
    ];
    expect(rankQuotes(r, '  ', ['a', 'gone', 'b']).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(rankQuotes(r, '', []).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('recents storage', () => {
  test('pushRecent dedupes, puts newest first, caps at 8', () => {
    const s = mem();
    for (let i = 1; i <= 10; i++) pushRecent(s, `id${i}`);
    expect(readRecents(s)).toEqual(['id10', 'id9', 'id8', 'id7', 'id6', 'id5', 'id4', 'id3']);
    pushRecent(s, 'id5');
    expect(readRecents(s)[0]).toBe('id5');
    expect(readRecents(s).filter((x) => x === 'id5')).toHaveLength(1);
    expect(readRecents(s)).toHaveLength(8);
  });

  test('pushRecent honours a custom max', () => {
    const s = mem();
    pushRecent(s, 'a', 2); pushRecent(s, 'b', 2); pushRecent(s, 'c', 2);
    expect(readRecents(s)).toEqual(['c', 'b']);
  });

  test('readRecents tolerates missing, garbage and wrong-shape storage', () => {
    expect(readRecents(mem())).toEqual([]);
    expect(readRecents(mem('not json{'))).toEqual([]);
    expect(readRecents(mem('{"a":1}'))).toEqual([]);
    expect(readRecents(mem('["a",3,null,"b"]'))).toEqual(['a', 'b']);
    expect(readRecents(null)).toEqual([]);
    expect(readRecents({ getItem: () => { throw new Error('x'); }, setItem: () => {} })).toEqual([]);
  });

  test('pushRecent never throws when storage fails', () => {
    expect(() => pushRecent({ getItem: () => null, setItem: () => { throw new Error('full'); } }, 'a')).not.toThrow();
    expect(() => pushRecent(null, 'a')).not.toThrow();
  });
});
