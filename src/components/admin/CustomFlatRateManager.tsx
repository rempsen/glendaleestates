import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { customFlatKey, gstInclusiveFromCost, isCustomFlatKey } from '@/lib/customFlatRate';

type Cfg = { id: string; config_key: string; config_value: number; description: string | null; is_active?: boolean };

export function CustomFlatRateManager({ pricingConfig, markup, gstRate, onChanged }: {
  pricingConfig: Cfg[]; markup: number; gstRate: number; onChanged: () => void;
}) {
  const items = pricingConfig.filter(c => isCustomFlatKey(c.config_key));
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { name?: string; price?: string }>>({});

  const add = async () => {
    const p = parseFloat(price);
    if (!name.trim() || !(p > 0)) { toast.error('Enter a name and a client price excluding GST'); return; }
    setBusy(true);
    const { error } = await supabase.from('pricing_config').insert({
      config_key: customFlatKey(name), config_value: Math.round(p * 100) / 100,
      description: name.trim(), is_percentage: false, is_active: true,
    });
    setBusy(false);
    if (error) { toast.error('Could not add item', { description: error.message }); return; }
    setName(''); setPrice(''); toast.success('Flat-rate item added'); onChanged();
  };
  const save = async (id: string, patch: Partial<Cfg>) => {
    const { error } = await supabase.from('pricing_config').update(patch).eq('id', id);
    if (error) { toast.error('Could not save', { description: error.message }); return; }
    onChanged();
  };
  const remove = async (id: string) => {
    if (!confirm('Remove this flat-rate item?')) return;
    const { error } = await supabase.from('pricing_config').delete().eq('id', id);
    if (error) { toast.error('Could not remove', { description: error.message }); return; }
    onChanged();
  };

  return (
    <div className="mt-6 space-y-4 border-t border-border pt-6">
      <div>
        <h3 className="font-medium">Custom Flat-Rate Items</h3>
        <p className="text-xs text-muted-foreground">
          Enter the customer-facing price, already marked up and excluding GST. No further markup is applied; GST is added on top. These items appear in "Start from Pricing Control" when adding custom line items to a client.
        </p>
      </div>
      {items.map(c => {
        const d = drafts[c.id] || {};
        const active = c.is_active !== false;
        const incl = Number(c.config_value) || 0;
        return (
          <div key={c.id} className={`grid grid-cols-1 md:grid-cols-[1fr_160px_auto_auto] gap-3 items-center p-3 border rounded-lg ${!active ? 'opacity-50' : ''}`}>
            <Input value={d.name ?? c.description ?? ''} onChange={e => setDrafts(s => ({ ...s, [c.id]: { ...d, name: e.target.value } }))}
              onBlur={() => d.name !== undefined && d.name.trim() && save(c.id, { description: d.name.trim() })} />
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">$</span>
              <Input type="number" min="0" step="0.01" value={d.price ?? String(incl)}
                onChange={e => setDrafts(s => ({ ...s, [c.id]: { ...d, price: e.target.value } }))}
                onBlur={() => d.price !== undefined && save(c.id, { config_value: Math.round((parseFloat(d.price) || 0) * 100) / 100 })} />
            </div>
            <Switch checked={active} onCheckedChange={v => save(c.id, { is_active: v })} />
            <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
            <p className="text-xs text-muted-foreground md:col-span-4">
              Client price ${incl.toFixed(2)} + GST • Client sees: <span className="font-medium text-primary">${gstInclusiveFromCost(c.config_value, gstRate).toFixed(2)}</span> incl. GST
            </p>
          </div>
        );
      })}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3 items-end">
        <div className="space-y-1"><Label className="text-xs">Item name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Closet shelving upgrade" /></div>
        <div className="space-y-1"><Label className="text-xs">Client price (excl. GST)</Label>
          <Input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
        <Button onClick={add} disabled={busy}><Plus className="h-4 w-4 mr-1" />Add flat-rate item</Button>
      </div>
    </div>
  );
}
