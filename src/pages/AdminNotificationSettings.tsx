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
      </div>
    </AdminLayout>
  );
}
