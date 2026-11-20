// "Client-facing notes — printed for the buyer": every note the buyer PDF prints under "Your Comments & Notes"
// (src/lib/clientNotes.ts `clientNoteEntries`), including blank fields and one row per area upgrade, each editable in
// place. Buyer-safe by construction: it reads only the six comment columns and area `clientComment`, never
// `sales_comments`, `admin_notes`, area `comments` or line `internal_note`. Saving goes through the caller
// (`onSave` → `saveClientNotes`), one field per commit; only the cell being saved is disabled, and a failed save
// (not a conflict, which reloads the row) puts that cell back to the stored text. The caller toasts.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditableCell } from '@/components/quote/LineRow';
import { clientNoteEntries, type ClientNoteSource, type ClientNotesPatch } from '@/lib/clientNotes';

export interface ClientNotesPanelProps {
  row: ClientNoteSource;
  /** Persists one note and says how it went; omitted → read-only. */
  onSave?: (patch: ClientNotesPatch) => Promise<ClientNoteSaveOutcome>;
}

export type ClientNoteSaveOutcome = 'saved' | 'conflict' | 'error';

export function ClientNotesPanel({ row, onSave }: ClientNotesPanelProps) {
  const entries = clientNoteEntries(row, { includeEmpty: true });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Bumping a cell's generation remounts it, so its draft goes back to the stored value after a failed save.
  const [generation, setGeneration] = useState<Record<string, number>>({});
  const commit = async (cellKey: string, patch: ClientNotesPatch) => {
    if (!onSave) return;
    setSavingKey(cellKey);
    try {
      if ((await onSave(patch)) === 'error') setGeneration((g) => ({ ...g, [cellKey]: (g[cellKey] ?? 0) + 1 }));
    } finally {
      setSavingKey(null);
    }
  };
  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm">Client-facing notes — printed for the buyer</CardTitle>
        <p className="text-xs text-muted-foreground">
          These print under "Your Comments &amp; Notes" on the buyer's PDF. Blank notes are not printed.
        </p>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-sm">
        <dl className="grid gap-2 md:grid-cols-2">
          {entries.map((e) => {
            const cellKey = e.kind === 'field' ? e.key : `area-${e.index}`;
            return (
            <div key={cellKey} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{e.label}</dt>
              <dd>
                <EditableCell
                  key={`${cellKey}-${generation[cellKey] ?? 0}`}
                  multiline value={e.text} disabled={!onSave || savingKey === cellKey} ariaLabel={`Client note: ${e.label}`}
                  placeholder="No note — type to add one for the buyer"
                  onCommit={(v) => {
                    if (!onSave || v.trim() === e.text.trim()) return;
                    void commit(cellKey, e.kind === 'field'
                      ? { fields: { [e.key]: v } }
                      : { areas: [{ index: e.index, areaId: e.areaId, text: v }] });
                  }}
                />
              </dd>
            </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}
