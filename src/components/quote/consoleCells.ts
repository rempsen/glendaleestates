// Shared cell helpers for the meeting console rows (no React components here).
import type { LineUnit, Section } from '@/lib/quoteLines';

export const UNIT_OPTIONS: ReadonlyArray<{ value: LineUnit; label: string }> = [
  { value: 'sqft', label: 'sq ft' }, { value: 'sqyd', label: 'sq yd' }, { value: 'each', label: 'each' }, { value: 'flat', label: 'flat' },
];
const CELL = '[data-console-cell]';

/** Moves focus to the next console cell in document order (Enter behaves like Tab). */
export function focusNextCell(from: HTMLElement) {
  const cells = Array.from(document.querySelectorAll<HTMLElement>(CELL)).filter((el) => !el.hasAttribute('disabled'));
  const next = cells[cells.indexOf(from) + 1];
  next?.focus();
}

export const isSaveKey = (e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key'>) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';

/** '' → null; currency text (dollar sign, commas) is stripped; anything else unparseable → undefined (rejected). */
export function parseNumber(raw: string): number | null | undefined {
  const s = raw.replace(/[$,\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export const sectionAnchor = (s: Section) => `section-${s}`;

/** DOM id of a console line row; the pricing queue / Teams deep link is /admin/quotes/:id#line-:lineId. */
export const lineAnchor = (lineId: string) => `line-${lineId}`;
