import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, ExternalLink, Loader2, Unplug, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { qboReconnectReason, type QboSyncLogLike } from '@/lib/qboReconnect';
import QboSettingsPanel from '@/components/admin/QboSettingsPanel';

interface QboConnection {
  id: string;
  realm_id: string;
  environment: string;
  connected_by_email: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string | null;
  created_at: string;
}

export default function AdminQuickBooksSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [conn, setConn] = useState<QboConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [lastSync, setLastSync] = useState<QboSyncLogLike | null>(null);

  const loadConnection = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('qbo_connections' as never)
      .select('id,realm_id,environment,connected_by_email,access_token_expires_at,refresh_token_expires_at,created_at')
      .eq('is_active', true)
      .maybeSingle();
    setConn((data as QboConnection | null) ?? null);
    // Latest estimate sync: a token-refresh failure after this connection also means "reconnect".
    const { data: log } = await supabase
      .from('qbo_sync_log' as never)
      .select('status,error_message,created_at')
      .eq('operation', 'sync_submission')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLastSync((log as QboSyncLogLike | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { loadConnection(); }, []);

  // Handle redirect-back from OAuth callback
  useEffect(() => {
    const status = searchParams.get('qbo');
    if (status === 'connected') {
      toast({ title: 'QuickBooks connected', description: 'Your portal is now linked to QuickBooks Online.' });
      loadConnection();
      searchParams.delete('qbo'); searchParams.delete('realm');
      setSearchParams(searchParams, { replace: true });
    } else if (status === 'error') {
      const reason = searchParams.get('reason') || 'unknown';
      toast({ title: 'QuickBooks connection failed', description: reason, variant: 'destructive' });
      searchParams.delete('qbo'); searchParams.delete('reason');
      setSearchParams(searchParams, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const returnTo = `${window.location.origin}/admin/settings/quickbooks`;
      const { data, error } = await supabase.functions.invoke('qbo-oauth-start', {
        body: { return_to: returnTo },
      });
      if (error) throw error;
      if (!data?.authorization_url) throw new Error('No authorization URL returned');
      window.location.href = data.authorization_url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Could not start QuickBooks connection', description: msg, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect QuickBooks Online? Future syncs will pause until reconnected.')) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('qbo-disconnect', { body: {} });
      if (error) throw error;
      toast({ title: 'Disconnected', description: 'QuickBooks connection removed.' });
      await loadConnection();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Disconnect failed', description: msg, variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const reconnectReason = loading ? null : qboReconnectReason(conn, lastSync);

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">QuickBooks Online</h1>
          <p className="text-muted-foreground mt-1">
            Sync customers, projects, estimates, invoices, payments, and purchase orders with QuickBooks.
          </p>
        </div>

        {reconnectReason && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Reconnect QuickBooks</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{reconnectReason} Estimates will not sync until an admin reconnects.</p>
              <Button size="sm" onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                Reconnect QuickBooks
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Connection</span>
              {loading ? null : conn && reconnectReason ? (
                <Badge variant="destructive">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Reconnect needed
                </Badge>
              ) : conn ? (
                <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <XCircle className="w-3 h-3 mr-1" /> Not connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              A single shared QuickBooks Online connection is used for the whole portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center text-muted-foreground">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…
              </div>
            ) : conn ? (
              <>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Realm (Company) ID</dt>
                    <dd className="font-mono">{conn.realm_id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Environment</dt>
                    <dd className="capitalize">{conn.environment}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Connected by</dt>
                    <dd>{conn.connected_by_email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Connected on</dt>
                    <dd>{new Date(conn.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Access token expires</dt>
                    <dd>{new Date(conn.access_token_expires_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Refresh token expires</dt>
                    <dd>{conn.refresh_token_expires_at ? new Date(conn.refresh_token_expires_at).toLocaleString() : '—'}</dd>
                  </div>
                </dl>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={handleConnect} disabled={connecting}>
                    {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                    Reconnect
                  </Button>
                  <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
                    {disconnecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unplug className="w-4 h-4 mr-2" />}
                    Disconnect
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Click below to authorize the portal to access your QuickBooks Online company.
                  You'll sign in with QuickBooks and pick the company to connect.
                </p>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Connect to QuickBooks
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <QboSettingsPanel enabled={!!conn} />

        <Card>
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <CardDescription>One-time steps in the Intuit Developer portal</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>1. Sign in at <a className="text-primary underline" href="https://developer.intuit.com" target="_blank" rel="noreferrer">developer.intuit.com</a> and open your app's <strong>Production</strong> Keys &amp; OAuth tab.</p>
            <p>2. Add this exact <strong>Redirect URI</strong> to the allowed list:</p>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qbo-oauth-callback`}
            </pre>
            <p className="text-muted-foreground">3. Phase 2 (sync customers + estimates) and Phase 3 (payment webhooks) will unlock once connected.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
