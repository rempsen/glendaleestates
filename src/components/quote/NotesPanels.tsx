// Notes under the console's lines: client notes (printed), internal notes (never printed), follow-ups (read-only
// from custom_pricing.followUps until a later task moves them).
import type { StoredLine } from '@/lib/quoteLinesReducer';
import type { FollowUp } from '@/lib/upgradeTotals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface NotesPanelsProps {
  lines: StoredLine[];
  followUps: FollowUp[];
}

const where = (l: StoredLine) => [l.location, l.label].filter(Boolean).join(' · ');

export function NotesPanels({ lines, followUps }: NotesPanelsProps) {
  const live = lines.filter((l) => l.status !== 'removed');
  const client = live.filter((l) => l.client_note);
  const internal = live.filter((l) => l.internal_note);
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
        <CardContent className="p-3 pt-0 text-sm">
          {internal.length ? (
            <ul className="space-y-1.5">
              {internal.map((l) => <li key={l.id}><span className="text-xs text-muted-foreground">{where(l)}</span><br />{l.internal_note}</li>)}
            </ul>
          ) : <p className="text-muted-foreground">None</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="p-3 pb-1"><CardTitle className="text-sm">Follow-ups</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0 text-sm">
          {followUps.length ? (
            <ul className="space-y-1">
              {followUps.map((f) => (
                <li key={f.id} className={f.done ? 'text-muted-foreground line-through' : undefined}>
                  {f.done ? '☑' : '☐'} {f.text}
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">None</p>}
        </CardContent>
      </Card>
    </div>
  );
}
