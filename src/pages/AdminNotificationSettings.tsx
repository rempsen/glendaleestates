import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, Plus } from 'lucide-react';
import {
  RECIPIENTS_KEY, addRecipient, removeRecipient, parseStoredRecipients,
} from '@/lib/notificationRecipients';
import {
  DEFAULT_ESCALATION_HOURS, SETTINGS_KEYS, parseDigestRecipients, parseEscalationHours, parseTeamsWebhookUrl,
} from '@shared/pricingQueue';
import { pricingSettingsRows } from '@/lib/pricingQueue';

/** Pricing requests (Phase 2 Task 12): Teams webhook, escalation hours, digest recipients, test card. */
function PricingRequestSettings({ userId }: { userId: string | null }) {
  const { toast } = useToast();
  const [teamsUrl, setTeamsUrl] = useState('');
  const [hours, setHours] = useState(String(DEFAULT_ESCALATION_HOURS));
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const touch = () => { setDirty(true); setFormError(null); };

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('portal_settings' as never)
        .select('key,value')
        .in('key', Object.values(SETTINGS_KEYS));
      if (error) {
        toast({ title: 'Could not load pricing-request settings', description: error.message, variant: 'destructive' });
      } else {
        const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
        const get = (k: string) => rows.find((r) => r.key === k)?.value;
        setTeamsUrl(parseTeamsWebhookUrl(get(SETTINGS_KEYS.teamsWebhookUrl)) ?? '');
        setHours(String(parseEscalationHours(get(SETTINGS_KEYS.escalationHours))));
        setRecipients(parseDigestRecipients(get(SETTINGS_KEYS.digestRecipients)));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = () => {
    const result = addRecipient(recipients, draft);
    if ('error' in result) { setFormError(result.error); return; }
    setRecipients(result.list);
    setDraft('');
    touch();
  };

  const handleSave = async () => {
    const r = pricingSettingsRows({ teamsUrl, hours, recipients });
    if (r.ok === false) { setFormError(r.error); return; }
    setSaving(true);
    const at = new Date().toISOString();
    const { error } = await supabase
      .from('portal_settings' as never)
      .upsert(r.rows.map((row) => ({ ...row, updated_at: at, updated_by: userId })) as never, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    setDirty(false);
    toast({ title: 'Pricing-request settings saved' });
  };

  const handleTest = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('notify-pricing-request', { body: { test: true } });
    setTesting(false);
    const res = (data ?? {}) as { ok?: boolean; channel?: string; error?: string };
    if (error || !res.ok) {
      toast({ title: 'Test card not sent', description: res.error ?? error?.message ?? 'Unknown error', variant: 'destructive' });
      return;
    }
    toast({
      title: res.channel === 'teams' ? 'Test card posted to Teams' : 'Teams unavailable — test sent by email',
      description: res.channel === 'teams' ? 'Check the Teams channel.' : (res.error ? `Teams: ${res.error}. ` : '') + 'Check your inbox.',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing requests</CardTitle>
        <CardDescription>
          When a line is flagged to someone for pricing, a card is posted to Teams (or emailed to them if Teams is not set
          or fails). Lines still waiting after the escalation time are emailed to the assignee in the daily 08:00 digest,
          which also goes to the recipients below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="teams-url">Teams Workflows webhook URL</Label>
              <Input
                id="teams-url" type="url" placeholder="https://… (from the Teams “Post to a channel when a webhook request is received” workflow)"
                value={teamsUrl} onChange={(e) => { setTeamsUrl(e.target.value); touch(); }}
              />
              <p className="text-xs text-muted-foreground">Leave blank to use email only. Treat this URL like a password.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="escalation-hours">Escalate after (hours)</Label>
              <Input
                id="escalation-hours" type="number" min={0.5} max={168} step={0.5} className="w-32"
                value={hours} onChange={(e) => { setHours(e.target.value); touch(); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Daily digest recipients</Label>
              <ul className="divide-y rounded-md border">
                {recipients.length === 0 && <li className="p-3 text-sm text-muted-foreground">No recipients yet.</li>}
                {recipients.map((email) => (
                  <li key={email} className="flex items-center justify-between p-3 text-sm">
                    <span>{email}</span>
                    <Button
                      variant="ghost" size="icon" aria-label={`Remove ${email}`}
                      onClick={() => { setRecipients(removeRecipient(recipients, email)); touch(); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Input
                  aria-label="Add digest recipient" type="email" placeholder="brian@… (add Brian's address)"
                  value={draft} onChange={(e) => { setDraft(e.target.value); setFormError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                />
                <Button type="button" variant="outline" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving || !dirty}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing || dirty} title={dirty ? 'Save first' : undefined}>
                {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send test card
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Admin-only (route is wrapped in ProtectedRoute; RLS on portal_settings also restricts to admins).
export default function AdminNotificationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('portal_settings' as never)
        .select('value')
        .eq('key', RECIPIENTS_KEY)
        .maybeSingle();
      if (error) {
        toast({ title: 'Could not load recipients', description: error.message, variant: 'destructive' });
      } else {
        const parsed = parseStoredRecipients((data as { value?: unknown } | null)?.value);
        setRecipients(parsed ?? []);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = () => {
    const result = addRecipient(recipients, draft);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setRecipients(result.list);
    setDraft('');
    setFormError(null);
    setDirty(true);
  };

  const handleSave = async () => {
    if (recipients.length === 0) {
      setFormError('Keep at least one recipient, or the built-in default list will be used.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('portal_settings' as never)
      .upsert(
        { key: RECIPIENTS_KEY, value: recipients, updated_at: new Date().toISOString(), updated_by: user?.id ?? null } as never,
        { onConflict: 'key' },
      );
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    setDirty(false);
    setFormError(null);
    toast({ title: 'Recipients saved', description: 'New submissions will notify this list.' });
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-4 max-w-2xl">
        <h1 className="text-2xl font-serif">Notification Settings</h1>
        <Card>
          <CardHeader>
            <CardTitle>Internal submission recipients</CardTitle>
            <CardDescription>
              These addresses receive the internal email (with CSV) each time a buyer submits their selections.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
            ) : (
              <>
                <ul className="divide-y rounded-md border">
                  {recipients.length === 0 && (
                    <li className="p-3 text-sm text-muted-foreground">No recipients. The built-in default list is used until you save one.</li>
                  )}
                  {recipients.map(email => (
                    <li key={email} className="flex items-center justify-between p-3 text-sm">
                      <span>{email}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${email}`}
                        onClick={() => { setRecipients(removeRecipient(recipients, email)); setDirty(true); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </li>
                  ))}
                </ul>

                <div className="space-y-2">
                  <Label htmlFor="new-recipient">Add recipient</Label>
                  <div className="flex gap-2">
                    <Input
                      id="new-recipient"
                      type="email"
                      placeholder="name@bmdmaterials.com"
                      value={draft}
                      onChange={e => { setDraft(e.target.value); setFormError(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                    />
                    <Button type="button" variant="outline" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" /> Add</Button>
                  </div>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
                </div>

                <Button onClick={handleSave} disabled={saving || !dirty}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        <PricingRequestSettings userId={user?.id ?? null} />
      </div>
    </AdminLayout>
  );
}
