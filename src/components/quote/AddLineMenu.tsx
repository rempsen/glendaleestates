// "+ Add line" for one console section: catalog preset | flat rate | manual | included | request pricing.
// Every price comes from addLinePresets (Pricing Control); this component only collects choices.
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { LineUnit, Section } from '@/lib/quoteLines';
import {
  catalogLine, flatRateLine, manualLine, includedLine, pendingLine, catalogOptions, flatRateOptions, areaOptions,
  defaultLocation, defaultAssignee, SECTION_LABELS, type LineDraft, type PresetPerson, type PresetSource,
} from '@/lib/addLinePresets';
import { formatMoney } from '@/components/quote/runningTotalModel';
import { UNIT_OPTIONS, parseNumber } from '@/components/quote/consoleCells';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type AddKind = 'catalog' | 'flat_rate' | 'manual' | 'included' | 'pending';
const KIND_LABEL: Record<AddKind, string> = {
  catalog: 'Catalog preset', flat_rate: 'Flat rate', manual: 'Manual price', included: 'Included (standard)', pending: 'Request pricing',
};
const NO_AREA = '__none';
const NO_ONE = '__none';

export interface AddLineMenuProps {
  section: Section;
  /** null while pricing loads: catalog and flat-rate presets are unavailable. */
  source: PresetSource | null;
  baseSpec: ReadonlyArray<{ section: string; location: string }>;
  people: PresetPerson[];
  recipients: string[] | null;
  /** True while lines load: createLine must not run (useQuoteLines review rule). */
  disabled: boolean;
  onCreate: (draft: LineDraft) => void;
}

export function AddLineMenu({ section, source, baseSpec, people, recipients, disabled, onCreate }: AddLineMenuProps) {
  const [kind, setKind] = useState<AddKind | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Add line to ${SECTION_LABELS[section]}`}>
            <Plus className="mr-1 h-4 w-4" />Add line
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(Object.keys(KIND_LABEL) as AddKind[]).map((k) => (
            <DropdownMenuItem key={k} disabled={!source && (k === 'catalog' || k === 'flat_rate')} onSelect={() => setKind(k)}>
              {KIND_LABEL[k]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {kind && (
        <AddLineDialog
          kind={kind} section={section} source={source} baseSpec={baseSpec} people={people} recipients={recipients}
          disabled={disabled} onClose={() => setKind(null)}
          onCreate={(d) => { onCreate(d); setKind(null); }}
        />
      )}
    </>
  );
}

interface DialogProps extends Omit<AddLineMenuProps, 'onCreate'> {
  kind: AddKind;
  onClose: () => void;
  onCreate: (draft: LineDraft) => void;
}

function AddLineDialog({ kind, section, source, baseSpec, people, recipients, disabled, onClose, onCreate }: DialogProps) {
  const locations = useMemo(() => Array.from(new Set(baseSpec.map((r) => r.location))).filter(Boolean), [baseSpec]);
  const [location, setLocation] = useState(() => defaultLocation(section, baseSpec));
  const [label, setLabel] = useState('');
  const [productName, setProductName] = useState('');
  const [productColour, setProductColour] = useState('');
  const [materialKey, setMaterialKey] = useState('');
  const [areaId, setAreaId] = useState(NO_AREA);
  const [configKey, setConfigKey] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<LineUnit>('each');
  const [unitPrice, setUnitPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [flagTo, setFlagTo] = useState<string>(NO_ONE);
  const [error, setError] = useState<string | null>(null);

  const materials = source ? catalogOptions(source) : [];
  const areas = source && materialKey ? areaOptions(source, materialKey) : [];
  const flatRates = source ? flatRateOptions(source) : [];

  // Request pricing: preselect the section's usual pricer when the people list allows it.
  useEffect(() => {
    if (kind !== 'pending') return;
    const d = defaultAssignee(section, people, recipients);
    if (d) setFlagTo((cur) => (cur === NO_ONE ? d : cur));
  }, [kind, section, people, recipients]);

  const listId = `locations-${section}`;
  const num = (s: string) => parseNumber(s);

  const build = (): LineDraft | { error: string } => {
    const q = num(qty); const up = num(unitPrice); const a = num(amount);
    if (q === undefined || up === undefined || a === undefined) return { error: 'Numbers only in quantity and price.' };
    if (!location.trim()) return { error: 'Enter a location.' };
    switch (kind) {
      case 'catalog':
        if (!source) return { error: 'Pricing is still loading.' };
        if (!materialKey) return { error: 'Pick a material.' };
        return catalogLine(source, {
          section, materialKey, location, areaId: areaId === NO_AREA ? null : areaId, quantity: q, productName, productColour,
        });
      case 'flat_rate':
        if (!source) return { error: 'Pricing is still loading.' };
        if (!configKey) return { error: 'Pick a flat rate.' };
        return flatRateLine(source, { section, configKey, location, quantity: q, label });
      case 'manual':
        if (!label.trim()) return { error: 'Enter the item.' };
        return manualLine({ section, location, label, unit, quantity: q, unitPrice: up, amount: a, productName, productColour });
      case 'included':
        if (!label.trim()) return { error: 'Enter the item.' };
        return includedLine({ section, location, label, productName, productColour });
      case 'pending':
        if (!label.trim()) return { error: 'Enter what needs pricing.' };
        return pendingLine({ section, location, label, flaggedTo: flagTo === NO_ONE ? null : flagTo });
    }
  };

  const submit = () => {
    if (disabled) { setError('Lines are still loading.'); return; }
    const r = build();
    if ('error' in r) { setError(r.error); return; }
    onCreate(r);
  };

  const showProduct = kind === 'catalog' || kind === 'manual' || kind === 'included';
  const showLabel = kind !== 'catalog';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{KIND_LABEL[kind]} — {SECTION_LABELS[section]}</DialogTitle>
          <DialogDescription>
            {kind === 'pending'
              ? 'Adds a Pending line (not in the total) and flags it to the person who will price it.'
              : kind === 'catalog' || kind === 'flat_rate'
                ? 'The price comes from Pricing Control.'
                : 'The line is added to this section and saves automatically.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid gap-1.5">
            <Label htmlFor={`${listId}-loc`}>Location</Label>
            <Input id={`${listId}-loc`} list={listId} value={location} onChange={(e) => setLocation(e.target.value)} autoFocus />
            <datalist id={listId}>{locations.map((l) => <option key={l} value={l} />)}</datalist>
          </div>

          {kind === 'catalog' && (
            <>
              <div className="grid gap-1.5">
                <Label>Material</Label>
                <Select value={materialKey} onValueChange={(v) => { setMaterialKey(v); setAreaId(NO_AREA); }}>
                  <SelectTrigger aria-label="Material"><SelectValue placeholder="Pick a material" /></SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => <SelectItem key={m.key} value={m.key}>{m.name} ({m.unit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Area (quantity from the unit's measurements)</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                  <SelectTrigger aria-label="Area"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_AREA}>No area — type a quantity</SelectItem>
                    {areas.map((a) => <SelectItem key={a.areaId} value={a.areaId}>{a.label} ({a.quantity})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {kind === 'flat_rate' && (
            <div className="grid gap-1.5">
              <Label>Flat rate</Label>
              <Select value={configKey} onValueChange={setConfigKey}>
                <SelectTrigger aria-label="Flat rate"><SelectValue placeholder="Pick a flat rate" /></SelectTrigger>
                <SelectContent>
                  {flatRates.map((f) => <SelectItem key={f.key} value={f.key}>{f.label} — {formatMoney(f.price)} {f.unit}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {showLabel && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${listId}-label`}>{kind === 'flat_rate' ? 'Item (optional — defaults to the rate name)' : 'Item'}</Label>
              <Input id={`${listId}-label`} value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          )}

          {showProduct && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${listId}-prod`}>Product</Label>
                <Input id={`${listId}-prod`} value={productName} onChange={(e) => setProductName(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${listId}-col`}>Colour</Label>
                <Input id={`${listId}-col`} value={productColour} onChange={(e) => setProductColour(e.target.value)} />
              </div>
            </div>
          )}

          {(kind === 'catalog' && areaId === NO_AREA) || kind === 'flat_rate' || kind === 'manual' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${listId}-qty`}>Quantity{kind === 'flat_rate' ? ' (default 1)' : ''}</Label>
                <Input id={`${listId}-qty`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              {kind === 'manual' && (
                <div className="grid gap-1.5">
                  <Label>Unit</Label>
                  <Select value={unit} onValueChange={(v) => setUnit(v as LineUnit)}>
                    <SelectTrigger aria-label="Unit"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNIT_OPTIONS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : null}

          {kind === 'manual' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`${listId}-up`}>Unit price</Label>
                <Input id={`${listId}-up`} inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${listId}-amt`}>or Amount</Label>
                <Input id={`${listId}-amt`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
          )}

          {kind === 'pending' && (
            <div className="grid gap-1.5">
              <Label>Flag to</Label>
              <Select value={flagTo} onValueChange={setFlagTo}>
                <SelectTrigger aria-label="Flag to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ONE}>No one yet</SelectItem>
                  {people.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={disabled}>Add line</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
