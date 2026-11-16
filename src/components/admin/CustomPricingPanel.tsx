import { clientPriceExGst, isCustomFlatKey } from '@/lib/customFlatRate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { useMemo } from 'react';
import {
  customItemAmount, parseCustomPricing,
  type CustomPricing, type CustomLineItem, type OverrideKey,
} from '@/lib/upgradeTotals';

const OVERRIDES: Array<{ key: OverrideKey; title: string; hint: string }> = [
  { key: 'stair', title: 'Stair upgrade', hint: 'Applies when stairs are upgraded to LVP' },
  { key: 'grout', title: 'Backsplash / grout', hint: 'Applies when grout colour change is on' },
  { key: 'bathroomTile', title: 'Bathroom porcelain tile', hint: 'Applies when the bathroom tile upgrade is on' },
  { key: 'heatedFloor', title: 'Heated tile floor', hint: 'Applies when at least one heated bathroom is set' },
  { key: 'customShower', title: 'Custom tiled shower', hint: 'Applies when the custom shower is on' },
];

const GST = 0.05;
const fmt = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => (v === '' ? null : Number(v));

export function CustomPricingPanel({ value, onChange }: { value: unknown; onChange: (v: CustomPricing) => void }) {
  const cp = parseCustomPricing(value);
  const overrides = cp.overrides || {};
  const items = cp.customItems || [];

  const setOverride = (k: OverrideKey, patch: { amount?: number | null; label?: string }) =>
    onChange({ ...cp, overrides: { ...overrides, [k]: { ...overrides[k], ...patch } } });
  const setItems = (next: CustomLineItem[]) => onChange({ ...cp, customItems: next });
  const updateItem = (i: number, patch: Partial<CustomLineItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const itemsTotal = items.reduce((t, i) => t + customItemAmount(i), 0);

  // Catalog from Pricing Control: materials (marked up to client price) and flat-rate items
  const { materials, config, markupPercentage } = useDynamicPricing() as unknown as {
    materials: Array<{ material_key: string; name: string; cost_per_unit: number; unit_type: string; is_active?: boolean }>;
    config: Array<{ config_key: string; config_value: number; description: string | null; is_active?: boolean; is_percentage?: boolean }>;
    markupPercentage: number;
  };
  const catalog = useMemo(() => {
    const mats = (materials || []).filter(m => m.is_active !== false).map(m => ({
      key: `mat:${m.material_key}`, label: m.name, unit: m.unit_type === 'flat' ? 'each' : m.unit_type,
      unitPrice: Math.round(Number(m.cost_per_unit) * (1 + (markupPercentage || 0)) * 100) / 100,
    }));
    const flats = (config || []).filter(c => c.is_active !== false && !c.is_percentage && /_price$|_per_/.test(c.config_key)).map(c => ({
      key: `cfg:${c.config_key}`, label: c.description || c.config_key.replace(/_/g, ' '), unit: 'each', unitPrice: isCustomFlatKey(c.config_key) ? clientPriceExGst(Number(c.config_value), markupPercentage || 0) : Number(c.config_value),
    }));
    return [...mats, ...flats];
  }, [materials, config, markupPercentage]);
  const applyCatalog = (i: number, key: string) => {
    const c = catalog.find(x => x.key === key);
    if (!c) return updateItem(i, { catalogKey: undefined });
    const cur = items[i];
    updateItem(i, { catalogKey: key, label: cur.label || c.label, unit: c.unit, unitPrice: c.unitPrice, quantity: cur.quantity ?? 1 });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; setItems(next);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        All prices entered here are PST included and GST exclusive. GST (5%) is added automatically to the client total, PDF and exports. Leave a price blank to use the standard calculated price.
      </p>

      <div className="space-y-3">
        <h4 className="font-medium">Office price overrides</h4>
        {OVERRIDES.map(o => {
          const cur = overrides[o.key] || {};
          const amt = Number(cur.amount);
          return (
            <div key={o.key} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_10rem] gap-2 items-end p-3 rounded-lg border border-border">
              <div>
                <Label>{o.title}</Label>
                <p className="text-xs text-muted-foreground">{o.hint}</p>
              </div>
              <div>
                <Label className="text-xs">Description shown to client (optional)</Label>
                <Input value={cur.label ?? ''} onChange={e => setOverride(o.key, { label: e.target.value })} placeholder="Leave blank for standard wording" />
              </div>
              <div>
                <Label className="text-xs">Price (before GST)</Label>
                <Input type="number" step="0.01" min="0" value={cur.amount ?? ''} onChange={e => setOverride(o.key, { amount: num(e.target.value) })} placeholder="Standard" />
                {cur.amount !== null && cur.amount !== undefined && !Number.isNaN(amt) && (
                  <p className="text-xs text-muted-foreground mt-1">With GST: {fmt(amt * (1 + GST))}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">Custom line items</h4>
        <p className="text-xs text-muted-foreground">Add anything quoted during consultation. Enter a quantity and unit price, or just a total price.</p>
        {items.map((it, i) => {
          const computed = Number(it.quantity) > 0 && !!it.unitPrice;
          return (
          <div key={it.id} className="p-3 rounded-lg border border-border space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr_1fr] gap-2">
              <div>
                <Label className="text-xs">Start from Pricing Control (optional)</Label>
                <Select value={it.catalogKey || 'none'} onValueChange={v => applyCatalog(i, v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Custom item" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Custom item</SelectItem>
                    {catalog.map(c => (
                      <SelectItem key={c.key} value={c.key}>{c.label} — ${c.unitPrice.toFixed(2)}/{c.unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Item (shown to client)</Label>
                <Input value={it.label} onChange={e => updateItem(i, { label: e.target.value })} placeholder="e.g. Walk-in closet floor tile" />
              </div>
              <div>
                <Label className="text-xs">Details (optional)</Label>
                <Input value={it.detail ?? ''} onChange={e => updateItem(i, { detail: e.target.value })} placeholder="Product, colour, area" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-[7rem_7rem_9rem_10rem_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Qty</Label>
                <Input type="number" step="0.01" min="0" value={it.quantity ?? ''} onChange={e => updateItem(i, { quantity: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Select value={it.unit || 'each'} onValueChange={v => updateItem(i, { unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['each', 'sqft', 'sqyd', 'lnft', 'hour', 'room', 'set'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Unit price</Label>
                <Input type="number" step="0.01" value={it.unitPrice ?? ''} onChange={e => updateItem(i, { unitPrice: num(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Total (before GST)</Label>
                <Input type="number" step="0.01" value={computed ? customItemAmount(it).toFixed(2) : (it.amount ?? '')}
                  disabled={computed} onChange={e => updateItem(i, { amount: num(e.target.value) })} />
              </div>
              <div className="flex gap-1 justify-end col-span-2 md:col-span-1">
                <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down"><ArrowDown className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setItems([...items.slice(0, i + 1), { ...it, id: crypto.randomUUID() }, ...items.slice(i + 1)])} aria-label="Duplicate item"><Copy className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, idx) => idx !== i))} aria-label="Remove item"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {computed ? `${it.quantity} ${it.unit || 'each'} × $${Number(it.unitPrice).toFixed(2)} = ` : ''}{fmt(customItemAmount(it))} + GST = {fmt(customItemAmount(it) * (1 + GST))}
            </p>
          </div>
          );
        })}
        <Button variant="outline" className="w-full" onClick={() => setItems([...items, { id: crypto.randomUUID(), label: '', quantity: 1, unit: 'each', unitPrice: null, amount: null }])}>
          <Plus className="w-4 h-4 mr-2" /> Add line item
        </Button>
        {items.length > 0 && (
          <p className="text-sm text-right">Custom items: <strong>{fmt(itemsTotal)}</strong> + GST {fmt(itemsTotal * GST)} = <strong>{fmt(itemsTotal * (1 + GST))}</strong></p>
        )}
      </div>
    </div>
  );
}
