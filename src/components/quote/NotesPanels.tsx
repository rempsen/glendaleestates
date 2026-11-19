// Notes under the console's lines: client notes (printed), internal notes (never printed) with the unit's basement
// notes, and follow-ups (add / edit / done / show client / delete). Follow-ups and basement notes live in
// custom_pricing and are saved only through src/lib/followUps.ts (the page passes `onSaveNotes`).
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { StoredLine } from '@/lib/quoteLinesReducer';
import type { FollowUp } from '@/lib/customPricing';
import type { NotesPatch } from '@/lib/followUps';
import {
  addFollowUp, editFollowUpText, removeFollowUp, toggleFollowUpClient, toggleFollowUpDone,
} from '@/lib/followUps';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EditableCell } from '@/components/quote/LineRow';

export interface NotesPanelsProps {
  lines: StoredLine[];
  followUps: FollowUp[];
  basementNotes?: string;
  /** Persists follow-ups / basement notes; omitted → read-only. */
  onSaveNotes?: (patch: NotesPatch) => void;
  saving?: boolean;
}

const where = (l: StoredLine) => [l.location, l.label].filter(Boolean).join(' · ');

export function NotesPanels({ lines, followUps, basementNotes = '', onSaveNotes, saving = false }: NotesPanelsProps) {
  const [draft, setDraft] = useState('');
  const live = lines.filter((l) => l.status !== 'removed');
  const client = live.filter((l) => l.client_note);
  const internal = live.filter((l) => l.internal_note);
  const editable = !!onSaveNotes && !saving;
  const setList = (next: FollowUp[]) => { if (onSaveNotes && next !== followUps) onSaveNotes({ followUps: next }); };
  const add = () => { const next = addFollowUp(followUps, draft); if (next !== followUps) { setList(next); setDraft(''); } };

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Client notes (printed)</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0 text-sm">
          {client.length ? (
            <ul className="space-y-1.5">
              {client.map((l) => <li key={l.id}><span className="text-xs text-muted-foreground">{where(l)}</span><br />{l.client_note}</li>)}
            </ul>
          ) : <p className="text-muted-foreground">None</p>}
        </CardContent>
      </Card>
      <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/30">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm text-amber-900 dark:text-amber-200">Internal notes — never printed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0 text-sm">
          {internal.length ? (
            <ul className="space-y-1.5">
              {internal.map((l) => <li key={l.id}><span className="text-xs text-muted-foreground">{where(l)}</span><br />{l.internal_note}</li>)}
            </ul>
          ) : <p className="text-muted-foreground">None</p>}
          <div>
            <p className="mb-1 text-xs font-medium text-amber-900 dark:text-amber-200">Basement notes (staff copy only)</p>
            <EditableCell
              multiline value={basementNotes} disabled={!editable} ariaLabel="Basement notes"
              onCommit={(v) => { if (onSaveNotes && v.trim() !== basementNotes.trim()) onSaveNotes({ basementNotes: v }); }}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Follow-ups</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-3 pt-0 text-sm">
          {followUps.length ? (
            <ul className="space-y-1.5">
              {followUps.map((f) => (
                <li key={f.id} className="flex items-start gap-2">
                  <Checkbox
                    checked={!!f.done} disabled={!editable} aria-label={`Done: ${f.text}`} className="mt-2"
                    onCheckedChange={() => setList(toggleFollowUpDone(followUps, f.id))}
                  />
                  <div className={`min-w-0 flex-1 ${f.done ? 'text-muted-foreground line-through' : ''}`}>
                    <EditableCell
                      value={f.text} disabled={!editable} ariaLabel="Follow-up text"
                      onCommit={(v) => setList(editFollowUpText(followUps, f.id, v))}
                    />
                    <label className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={!!f.clientVisible} disabled={!editable} aria-label={`Show client: ${f.text}`}
                        onCheckedChange={() => setList(toggleFollowUpClient(followUps, f.id))}
                      />
                      Show client
                    </label>
                  </div>
                  <Button
                    type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={!editable}
                    aria-label={`Delete follow-up: ${f.text}`} onClick={() => setList(removeFollowUp(followUps, f.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">None</p>}
          {onSaveNotes && (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a follow-up" aria-label="New follow-up" disabled={saving} className="h-8" />
              <Button type="submit" size="sm" variant="outline" className="h-8" disabled={saving || !draft.trim()}>Add</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
