import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
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
        {items.map((it, i) => (
          <div key={it.id} className="grid grid-cols-2 md:grid-cols-[2fr_2fr_6rem_8rem_8rem_auto] gap-2 items-end p-3 rounded-lg border border-border">
            <div className="col-span-2 md:col-span-1">
              <Label className="text-xs">Item</Label>
              <Input value={it.label} onChange={e => updateItem(i, { label: e.target.value })} placeholder="e.g. Closet floor tile" />
            </div>
            <div className="col-span-2 md:col-span-1">
              <Label className="text-xs">Details (optional)</Label>
              <Input value={it.detail ?? ''} onChange={e => updateItem(i, { detail: e.target.value })} placeholder="Product, colour, notes" />
            </div>
            <div>
              <Label className="text-xs">Qty</Label>
              <Input type="number" step="0.01" value={it.quantity ?? ''} onChange={e => updateItem(i, { quantity: num(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Unit price</Label>
              <Input type="number" step="0.01" value={it.unitPrice ?? ''} onChange={e => updateItem(i, { unitPrice: num(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Total (before GST)</Label>
              <Input type="number" step="0.01" value={Number(it.quantity) > 0 && it.unitPrice ? customItemAmount(it).toFixed(2) : (it.amount ?? '')}
                disabled={Number(it.quantity) > 0 && !!it.unitPrice}
                onChange={e => updateItem(i, { amount: num(e.target.value) })} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, idx) => idx !== i))} aria-label="Remove item">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" className="w-full" onClick={() => setItems([...items, { id: crypto.randomUUID(), label: '', amount: null }])}>
          <Plus className="w-4 h-4 mr-2" /> Add custom line item
        </Button>
        {items.length > 0 && (
          <p className="text-sm text-right">Custom items: <strong>{fmt(itemsTotal)}</strong> + GST {fmt(itemsTotal * GST)} = <strong>{fmt(itemsTotal * (1 + GST))}</strong></p>
        )}
      </div>
    </div>
  );
}
