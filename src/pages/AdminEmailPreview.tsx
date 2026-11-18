import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/send-selections-email`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// The function enforces the admin role for preview/test, so send the admin's session token (never the anon key).
async function adminHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not signed in');
  return { apikey: ANON, Authorization: `Bearer ${session.access_token}` };
}

export default function AdminEmailPreview() {
  const [type, setType] = useState<'buyer' | 'admin'>('buyer');
  const [html, setHtml] = useState<string>('');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  const loadPreview = async (t: 'buyer' | 'admin') => {
    setType(t);
    try {
      const res = await fetch(`${FN_URL}?action=preview&type=${t}`, { headers: await adminHeaders() });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      setHtml(await res.text());
    } catch (e) {
      toast({ title: 'Preview failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  useEffect(() => { loadPreview('buyer'); }, []);

  const sendTest = async () => {
    if (!to.includes('@')) return toast({ title: 'Enter a valid email', variant: 'destructive' });
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-selections-email', {
        body: { type, to },
        method: 'POST',
        // @ts-expect-error query string supported by invoke
        query: { action: 'test' },
      });
      // Fallback: invoke doesn't always pass query — call fetch directly
      if (error || !data) {
        const r = await fetch(`${FN_URL}?action=test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await adminHeaders()) },
          body: JSON.stringify({ type, to }),
        });
        if (!r.ok) throw new Error(await r.text());
      }
      toast({ title: `Test ${type} email sent to ${to}` });
    } catch (e) {
      toast({ title: 'Send failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-serif">Email Preview & Legibility Test</h1>
        <p className="text-sm text-muted-foreground">Render the buyer or admin email with sample data and send a one-off test to verify legibility in Gmail/Outlook before real submissions go out.</p>

        <div className="flex gap-2">
          <Button variant={type === 'buyer' ? 'default' : 'outline'} onClick={() => loadPreview('buyer')}>Buyer Email</Button>
          <Button variant={type === 'admin' ? 'default' : 'outline'} onClick={() => loadPreview('admin')}>Admin/Internal Email</Button>
        </div>

        <Card className="p-4 flex items-end gap-3">
          <div className="flex-1">
            <Label htmlFor="to">Send test to</Label>
            <Input id="to" type="email" placeholder="you@bmdmaterials.com" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={sendTest} disabled={sending}>{sending ? 'Sending…' : `Send Test ${type} Email`}</Button>
        </Card>

        <Card className="p-2">
          <iframe title="Email Preview" srcDoc={html} className="w-full h-[800px] border rounded bg-white" sandbox="allow-same-origin" />
        </Card>
      </div>
    </AdminLayout>
  );
}
