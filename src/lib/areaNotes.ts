// Area-upgrade notes come in two flavours:
//   clientComment - typed by the buyer (wizard) or deliberately written for the buyer (staff editor);
//                   prints on every buyer-facing output.
//   comments      - legacy field, internal from 2026-11-16; prints on staff outputs only.
export interface AreaNote { areaId: string; index: number; text: string }
type NoteSource = { areaId?: string; comments?: string | null; clientComment?: string | null };

const collect = (rows: NoteSource[] | null | undefined, key: 'clientComment' | 'comments'): AreaNote[] =>
  (rows || []).flatMap((u, index) => {
    const text = String(u?.[key] ?? '').trim();
    return text ? [{ areaId: u.areaId || '', index, text }] : [];
  });

export const clientAreaNotes = (rows: NoteSource[] | null | undefined) => collect(rows, 'clientComment');
export const internalAreaNotes = (rows: NoteSource[] | null | undefined) => collect(rows, 'comments');
