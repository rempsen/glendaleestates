// "Client-facing notes — printed for the buyer": every note the buyer PDF prints under "Your Comments & Notes"
// (src/lib/clientNotes.ts `clientNoteEntries`), including blank fields and one row per area upgrade, each editable in
// place. Buyer-safe by construction: it reads only the six comment columns and area `clientComment`, never
// `sales_comments`, `admin_notes`, area `comments` or line `internal_note`. Saving goes through the caller
// (`onSave` → `saveClientNotes`), one field per commit.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EditableCell } from '@/components/quote/LineRow';
import { clientNoteEntries, type ClientNoteSource, type ClientNotesPatch } from '@/lib/clientNotes';

export interface ClientNotesPanelProps {
  row: ClientNoteSource;
  /** Persists one note; omitted → read-only. */
  onSave?: (patch: ClientNotesPatch) => void;
  saving?: boolean;
}

export function ClientNotesPanel({ row, onSave, saving = false }: ClientNotesPanelProps) {
  const entries = clientNoteEntries(row, { includeEmpty: true });
  const editable = !!onSave && !saving;
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
          {entries.map((e) => (
            <div key={e.kind === 'field' ? e.key : `area-${e.index}`} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{e.label}</dt>
              <dd>
                <EditableCell
                  multiline value={e.text} disabled={!editable} ariaLabel={`Client note: ${e.label}`}
                  placeholder="No note — type to add one for the buyer"
                  onCommit={(v) => {
                    if (!onSave || v.trim() === e.text.trim()) return;
                    onSave(e.kind === 'field'
                      ? { fields: { [e.key]: v } }
                      : { areas: [{ index: e.index, areaId: e.areaId, text: v }] });
                  }}
                />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
