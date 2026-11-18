import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Copy, ArrowUp, ArrowDown, Eye, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { generateSavedSubmissionPdf } from '@/lib/savedSubmissionPdf';
import { downloadSubmissionWord } from '@/lib/submissionWordExport';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { useMemo } from 'react';
import {
  customItemAmount, parseCustomPricing, isCommitted, LINE_STATUS_LABELS,
  type CustomPricing, type LineStatus, type FollowUp, type CustomLineItem, type OverrideKey,
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

const AREAS = ['Main Living', 'Kitchen', 'Laundry', 'Primary Bedroom', 'Second Bedroom', 'Primary Ensuite', 'Guest Bathroom', 'Stairs to Upper Level', 'Stairs to Lower Level', 'Basement', 'Windows', 'Other'];

async function openClientPreview(id: string) {
  try {
    const b64 = await generateSavedSubmissionPdf(id, false, false);
    const raw = b64.includes(',') ? b64.split(',')[1] : b64;
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
  } catch (e) { toast.error('Could not build the client preview', { description: (e as Error).message }); }
}

export function CustomPricingPanel({ value, onChange, submissionId }: { value: unknown; onChange: (v: CustomPricing) => void; submissionId?: string }) {
  const cp = parseCustomPricing(value);
  const overrides = cp.overrides || {};
  const items = cp.customItems || [];

  const setOverride = (k: OverrideKey, patch: { amount?: number | null; label?: string }) =>
    onChange({ ...cp, overrides: { ...overrides, [k]: { ...overrides[k], ...patch } } });
  const setItems = (next: CustomLineItem[]) => onChange({ ...cp, customItems: next });
  const updateItem = (i: number, patch: Partial<CustomLineItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const itemsTotal = items.filter(isCommitted).reduce((t, i) => t + customItemAmount(i), 0);
  const notCounted = items.filter(i => !isCommitted(i));
  const followUps = cp.followUps || [];
  const setFollowUps = (next: FollowUp[]) => onChange({ ...cp, followUps: next });
  const provisional = cp.provisional || {};

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
      key: `cfg:${c.config_key}`, label: c.description || c.config_key.replace(/_/g, ' '), unit: 'each', unitPrice: Number(c.config_value),
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
            <div className="grid grid-cols-1 md:grid-cols-[12rem_12rem_1fr] gap-2">
              <div>
                <Label className="text-xs">Room / location</Label>
                <Select value={it.area || 'none'} onValueChange={v => updateItem(i, { area: v === 'none' ? undefined : v })}>
                  <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={it.status || 'upgrade'} onValueChange={v => updateItem(i, { status: v as LineStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LINE_STATUS_LABELS) as LineStatus[]).map(k => <SelectItem key={k} value={k}>{LINE_STATUS_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Staff note (internal)</Label>
                <Input value={it.note ?? ''} onChange={e => updateItem(i, { note: e.target.value })} placeholder="Why, who decided, what to verify" />
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
              {!isCommitted(it) && <span className="font-medium text-foreground">{LINE_STATUS_LABELS[it.status as LineStatus]} — not in total. </span>}
              {it.status === 'pending' ? 'Price: Pending' : <>{computed ? `${it.quantity} ${it.unit || 'each'} × $${Number(it.unitPrice).toFixed(2)} = ` : ''}{fmt(customItemAmount(it))} + GST = {fmt(customItemAmount(it) * (1 + GST))}</>}
            </p>
          </div>
          );
        })}
        <Button variant="outline" className="w-full" onClick={() => setItems([...items, { id: crypto.randomUUID(), label: '', quantity: 1, unit: 'each', unitPrice: null, amount: null }])}>
          <Plus className="w-4 h-4 mr-2" /> Add line item
        </Button>
        {items.length > 0 && (
          <p className="text-sm text-right">Custom items counted in total: <strong>{fmt(itemsTotal)}</strong> + GST {fmt(itemsTotal * GST)} = <strong>{fmt(itemsTotal * (1 + GST))}</strong></p>
        )}
        {notCounted.length > 0 && (
          <p className="text-sm text-right text-muted-foreground">{notCounted.length} line{notCounted.length > 1 ? 's' : ''} shown to the client as not included (pending, under review, deferred or standard).</p>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Provisional selections</h4>
        <Label className="text-xs">Main floor LVP colour — provisional note shown to client (leave blank when final)</Label>
        <Input value={provisional.lvp_colour ?? ''} onChange={e => onChange({ ...cp, provisional: { ...provisional, lvp_colour: e.target.value } })} placeholder="e.g. To be chosen by client at Nov 26 meeting" />
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Basement</h4>
        <p className="text-xs text-muted-foreground">Scope, decisions and notes (staff only). Add basement prices as line items above with room "Basement".</p>
        <Textarea rows={3} value={cp.basementNotes ?? ''} onChange={e => onChange({ ...cp, basementNotes: e.target.value })} />
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Follow-ups &amp; open questions</h4>
        {followUps.map((f, i) => (
          <div key={f.id} className="flex items-center gap-2">
            <Checkbox checked={!!f.done} onCheckedChange={c => setFollowUps(followUps.map((x, j) => j === i ? { ...x, done: !!c } : x))} aria-label="Done" />
            <Input value={f.text} onChange={e => setFollowUps(followUps.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} className={f.done ? 'line-through' : ''} />
            <label className="flex items-center gap-1 text-xs whitespace-nowrap">
              <Checkbox checked={!!f.clientVisible} onCheckedChange={c => setFollowUps(followUps.map((x, j) => j === i ? { ...x, clientVisible: !!c } : x))} /> Show client
            </label>
            <Button variant="ghost" size="icon" onClick={() => setFollowUps(followUps.filter((_, j) => j !== i))} aria-label="Remove follow-up"><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setFollowUps([...followUps, { id: crypto.randomUUID(), text: '' }])}><Plus className="w-4 h-4 mr-2" /> Add follow-up</Button>
      </div>

      {submissionId && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground w-full">Preview and Word use the last saved version — save first to include new edits.</p>
          <Button variant="outline" size="sm" onClick={() => openClientPreview(submissionId)}><Eye className="w-4 h-4 mr-2" /> Client preview (PDF)</Button>
          <Button variant="outline" size="sm" onClick={() => downloadSubmissionWord(submissionId, true).catch(e => toast.error('Word export failed', { description: (e as Error).message }))}><FileText className="w-4 h-4 mr-2" /> Word export</Button>
        </div>
      )}
    </div>
  );
}
