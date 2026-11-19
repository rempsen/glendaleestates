// One console section (spec §6.10 order): its lines and its Add-line menu.
import type { ReactNode } from 'react';
import type { LineStatus, Section } from '@/lib/quoteLines';
import type { LinePatch, StoredLine } from '@/lib/quoteLinesReducer';
import { SECTION_LABELS, type PresetPerson } from '@/lib/addLinePresets';
import { LineRow } from '@/components/quote/LineRow';
import { sectionAnchor } from '@/components/quote/consoleCells';
import type { LineReview } from '@/lib/myQuoteModel';

export interface SectionGroupProps {
  section: Section;
  /** This section's lines in display order, `removed` already filtered out. */
  lines: StoredLine[];
  people: PresetPerson[];
  onPatch: (id: string, patch: LinePatch) => void;
  onStatusChange: (line: StoredLine, to: LineStatus) => void;
  onRemove: (line: StoredLine) => void;
  onMove: (line: StoredLine, dir: -1 | 1) => void;
  addMenu: ReactNode;
  /** Latest buyer response per line id. */
  reviews?: Map<string, LineReview>;
}

export function SectionGroup({ section, lines, people, onPatch, onStatusChange, onRemove, onMove, addMenu, reviews }: SectionGroupProps) {
  return (
    <section id={sectionAnchor(section)} aria-labelledby={`${sectionAnchor(section)}-h`} className="scroll-mt-4 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id={`${sectionAnchor(section)}-h`} className="text-sm font-semibold">
          {SECTION_LABELS[section]}
          <span className="ml-2 font-normal text-muted-foreground">{lines.length ? `${lines.length} line${lines.length === 1 ? '' : 's'}` : 'No lines'}</span>
        </h2>
        {addMenu}
      </div>
      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <LineRow
              key={l.id}
              line={l}
              people={people}
              onPatch={(p) => onPatch(l.id, p)}
              onStatusChange={(to) => onStatusChange(l, to)}
              onRemove={() => onRemove(l)}
              onMove={(dir) => onMove(l, dir)}
              canMoveUp={i > 0}
              canMoveDown={i < lines.length - 1}
              review={reviews?.get(l.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
