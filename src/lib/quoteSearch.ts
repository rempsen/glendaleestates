// Pure search/rank helpers for the /admin/quotes list. No DOM, no Supabase.

export interface QuoteRow {
  id: string;
  unit_number: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  updated_at: string;
}

/** Minimal Storage-like surface so recents are testable without a DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const RECENTS_KEY = 'recentQuotes';
export const MAX_RECENTS = 8;

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

function scoreToken(row: QuoteRow, token: string): number {
  const unit = norm(row.unit_number);
  let score = 0;
  if (unit === token) score += 100;
  else if (unit.startsWith(token)) score += 60;
  if (norm(row.last_name).startsWith(token)) score += 50;
  if (norm(row.first_name).startsWith(token)) score += 30;
  if (norm(row.email).includes(token)) score += 20;
  return score;
}

const byUpdatedDesc = (a: QuoteRow, b: QuoteRow) =>
  (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);

export function rankQuotes<T extends QuoteRow>(rows: T[], query: string, recents: string[] = []): T[] {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const seen = new Set<string>();
    const head: T[] = [];
    for (const id of recents) {
      const r = byId.get(id);
      if (r && !seen.has(id)) { seen.add(id); head.push(r); }
    }
    const rest = rows.filter((r) => !seen.has(r.id)).sort(byUpdatedDesc);
    return [...head, ...rest];
  }
  return rows
    .map((r) => ({ r, score: tokens.reduce((sum, t) => sum + scoreToken(r, t), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || byUpdatedDesc(a.r, b.r))
    .map((x) => x.r);
}

export function readRecents(storage: StorageLike | null | undefined): string[] {
  try {
    const raw = storage?.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

export function pushRecent(storage: StorageLike | null | undefined, id: string, max = MAX_RECENTS): string[] {
  const next = [id, ...readRecents(storage).filter((x) => x !== id)].slice(0, max);
  try {
    storage?.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable or full: recents are best-effort */
  }
  return next;
}
