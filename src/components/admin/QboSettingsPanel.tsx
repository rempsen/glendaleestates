import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, RefreshCw } from 'lucide-react';

interface AccountOption { Id: string; Name: string; AccountType?: string }
interface TaxCodeOption { Id: string; Name: string; Description?: string }

interface AccountsPayload {
  income_accounts: AccountOption[];
  ar_accounts: AccountOption[];
  deposit_accounts: AccountOption[];
  tax_codes: TaxCodeOption[];
}

interface QboSettingsRow {
  id?: string;
  default_income_account_ref: string | null;
  default_income_account_name: string | null;
  default_ar_account_ref: string | null;
  default_ar_account_name: string | null;
  default_deposit_account_ref: string | null;
  default_deposit_account_name: string | null;
  default_tax_code_ref: string | null;
  default_tax_code_name: string | null;
  item_sku_prefix: string;
  customer_name_template: string;
  project_name_template: string;
  auto_create_items: boolean;
}

const EMPTY: QboSettingsRow = {
  default_income_account_ref: null, default_income_account_name: null,
  default_ar_account_ref: null, default_ar_account_name: null,
  default_deposit_account_ref: null, default_deposit_account_name: null,
  default_tax_code_ref: null, default_tax_code_name: null,
  item_sku_prefix: 'GLEN-',
  customer_name_template: '{last_name}, {first_name}',
  project_name_template: 'Unit {unit_number}',
  auto_create_items: true,
};

export default function QboSettingsPanel({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<QboSettingsRow>(EMPTY);
  const [accounts, setAccounts] = useState<AccountsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (enabled) loadAll(); }, [enabled]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: row }, accRes] = await Promise.all([
        supabase.from('qbo_settings' as never).select('*').limit(1).maybeSingle(),
        supabase.functions.invoke('qbo-list-accounts', { body: {} }),
      ]);
      if (row) setSettings({ ...EMPTY, ...(row as Partial<QboSettingsRow>) });
      if (accRes.error) throw accRes.error;
      setAccounts(accRes.data as AccountsPayload);
    } catch (e) {
      toast({
        title: 'Failed to load QuickBooks accounts',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      const { error } = await supabase
        .from('qbo_settings' as never)
        .upsert(payload as never, { onConflict: 'id' });
      if (error) throw error;
      toast({ title: 'QuickBooks defaults saved' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  const pickAccount = (
    list: AccountOption[] | undefined, refKey: keyof QboSettingsRow, nameKey: keyof QboSettingsRow,
  ) => (id: string) => {
    const found = list?.find(a => a.Id === id);
    setSettings(s => ({
      ...s, [refKey]: id, [nameKey]: found?.Name ?? null,
    } as QboSettingsRow));
  };

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Defaults & mapping</CardTitle>
          <CardDescription>Connect QuickBooks first to configure sync defaults.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Defaults & mapping</span>
          <Button size="sm" variant="ghost" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardTitle>
        <CardDescription>
          Where new estimates, items and customers post in QuickBooks. These defaults are used every time a submission is synced.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading QuickBooks lists…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Income account (revenue)">
              <Select
                value={settings.default_income_account_ref ?? ''}
                onValueChange={pickAccount(accounts?.income_accounts, 'default_income_account_ref', 'default_income_account_name')}
              >
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {accounts?.income_accounts.map(a => (
                    <SelectItem key={a.Id} value={a.Id}>{a.Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Accounts Receivable">
              <Select
                value={settings.default_ar_account_ref ?? ''}
                onValueChange={pickAccount(accounts?.ar_accounts, 'default_ar_account_ref', 'default_ar_account_name')}
              >
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {accounts?.ar_accounts.map(a => (
                    <SelectItem key={a.Id} value={a.Id}>{a.Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Deposit / Undeposited Funds">
              <Select
                value={settings.default_deposit_account_ref ?? ''}
                onValueChange={pickAccount(accounts?.deposit_accounts, 'default_deposit_account_ref', 'default_deposit_account_name')}
              >
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {accounts?.deposit_accounts.map(a => (
                    <SelectItem key={a.Id} value={a.Id}>{a.Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Default tax code">
              <Select
                value={settings.default_tax_code_ref ?? ''}
                onValueChange={(id) => {
                  const f = accounts?.tax_codes.find(t => t.Id === id);
                  setSettings(s => ({ ...s, default_tax_code_ref: id, default_tax_code_name: f?.Name ?? null }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {accounts?.tax_codes.map(t => (
                    <SelectItem key={t.Id} value={t.Id}>{t.Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Item SKU prefix">
              <Input value={settings.item_sku_prefix}
                onChange={e => setSettings(s => ({ ...s, item_sku_prefix: e.target.value }))} />
            </Field>

            <Field label="Customer name template">
              <Input value={settings.customer_name_template}
                onChange={e => setSettings(s => ({ ...s, customer_name_template: e.target.value }))}
                placeholder="{last_name}, {first_name}" />
            </Field>

            <Field label="Project name template">
              <Input value={settings.project_name_template}
                onChange={e => setSettings(s => ({ ...s, project_name_template: e.target.value }))}
                placeholder="Unit {unit_number}" />
            </Field>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Submissions auto-sync to QuickBooks the moment an admin marks them as <strong>Quoted</strong>.
          </p>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
