// Windows step (Phase 2 Task 9, spec §6.3): window coverings collected by location. Bedroom shades are included
// (read-only; may be motorized); every other window is a row with a location (preset or typed), a product and an
// optional Somfy motor. Presentational: the wizard owns the list and derives the three integer columns from it.
import { Plus, Trash2, Check } from 'lucide-react';
import type { QuoteWindowKind } from '@/lib/quoteLines';
import { WINDOW_KIND_PRODUCTS } from '@/lib/quoteLines';
import { MAX_WIZARD_WINDOWS, MAX_WINDOW_LOCATION, type WizardWindow } from '@shared/wizardWindows';
import { WINDOW_LOCATION_PRESETS } from '@/lib/baseSpec';
import { newWindowId } from '@/lib/draftWindows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const OTHER = '__other';
type AddedKind = Exclude<QuoteWindowKind, 'included'>;
const KIND_OPTIONS: { value: AddedKind; label: string }[] = [
  { value: 'roller_5', label: WINDOW_KIND_PRODUCTS.roller_5 },
  { value: 'roller_1', label: WINDOW_KIND_PRODUCTS.roller_1 },
  { value: 'panel_track', label: `${WINDOW_KIND_PRODUCTS.panel_track} (patio door)` },
];

export interface IncludedShade { location: string; product: string | null }

interface Props {
  windows: WizardWindow[];
  onChange: (next: WizardWindow[]) => void;
  included: IncludedShade[];
  /** Unit prices from pricing_config (display only; the rail shows the totals). */
  prices: { window: number; patioDoor: number; motor: number };
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LocatedWindowsList({ windows, onChange, included, prices }: Props) {
  const added = windows.filter((w) => w.kind !== 'included');
  const atMax = windows.length >= MAX_WIZARD_WINDOWS;
  const update = (id: string, patch: Partial<WizardWindow>) => onChange(windows.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const remove = (id: string) => onChange(windows.filter((w) => w.id !== id));
  const add = () => {
    if (atMax) return;
    const used = new Set(added.map((w) => w.location));
    const location = WINDOW_LOCATION_PRESETS.find((p) => !used.has(p) && p !== 'Patio Door') || 'Main Living';
    onChange([...windows, { id: newWindowId(), location, kind: 'roller_5', motorized: false }]);
  };
  const motorRowFor = (location: string) => windows.find((w) => w.kind === 'included' && w.location === location);
  const toggleIncludedMotor = (location: string, on: boolean) => {
    const existing = motorRowFor(location);
    if (on && !existing && !atMax) onChange([...windows, { id: newWindowId(), location, kind: 'included', motorized: true }]);
    if (!on && existing) remove(existing.id);
  };
  // Motorized included rows whose location is not a bedroom of this unit (e.g. migrated drafts) stay visible.
  const orphanMotors = windows.filter((w) => w.kind === 'included' && !included.some((i) => i.location === w.location));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-foreground mb-2">Included in your bedrooms</h3>
        <ul className="space-y-2">
          {included.map((s) => (
            <li key={s.location} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.location}</p>
                <p className="text-xs text-muted-foreground">{s.product || 'Roller shade'}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3 w-3" />Included</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={!!motorRowFor(s.location)}
                    onCheckedChange={(on) => toggleIncludedMotor(s.location, on)}
                    aria-label={`Add Somfy motorization to the ${s.location} shade`}
                  />
                  Motorize ({money(prices.motor)})
                </label>
              </div>
            </li>
          ))}
          {orphanMotors.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <span>{w.location || 'Window'} — Somfy motorization</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(w.id)} aria-label={`Remove motorization for ${w.location || 'window'}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-medium text-foreground mb-1">Other windows and patio doors</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Add a covering for each window you want covered. Roller shades {money(prices.window)} each; sliding panel track{' '}
          {money(prices.patioDoor)} per patio door; Somfy motorization {money(prices.motor)} per window (pre-GST, installed).
        </p>
        {added.length === 0 && <p className="text-sm text-muted-foreground mb-3">No additional windows yet.</p>}
        <ul className="space-y-3">
          {added.map((w, i) => {
            const isPreset = (WINDOW_LOCATION_PRESETS as readonly string[]).includes(w.location);
            const n = i + 1;
            return (
              <li key={w.id} className="rounded-lg border border-border bg-card p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label htmlFor={`win-loc-${w.id}`} className="text-xs">Location</Label>
                    <Select
                      value={isPreset ? w.location : OTHER}
                      onValueChange={(v) => update(w.id, v === OTHER
                        ? { location: '' }
                        : { location: v, ...(v === 'Patio Door' ? { kind: 'panel_track' as const } : {}) })}
                    >
                      <SelectTrigger id={`win-loc-${w.id}`} aria-label={`Window ${n} location`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WINDOW_LOCATION_PRESETS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        <SelectItem value={OTHER}>Other…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!isPreset && (
                      <Input
                        value={w.location}
                        maxLength={MAX_WINDOW_LOCATION}
                        placeholder="e.g. Den, Office"
                        aria-label={`Window ${n} location name`}
                        onChange={(e) => update(w.id, { location: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`win-kind-${w.id}`} className="text-xs">Covering</Label>
                    <Select value={w.kind} onValueChange={(v) => update(w.id, { kind: v as AddedKind })}>
                      <SelectTrigger id={`win-kind-${w.id}`} aria-label={`Window ${n} covering`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {KIND_OPTIONS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={w.motorized}
                        onCheckedChange={(on) => update(w.id, { motorized: on })}
                        aria-label={`Add Somfy motorization to window ${n}`}
                      />
                      Motorize
                    </label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(w.id)} aria-label={`Remove window ${n}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Button type="button" variant="outline" className="mt-3 gap-2" onClick={add} disabled={atMax}>
          <Plus className="h-4 w-4" />
          {added.length === 0 ? 'Add a window' : 'Add another window'}
        </Button>
        {atMax && <p className="mt-2 text-xs text-muted-foreground">Up to {MAX_WIZARD_WINDOWS} windows per unit; tell our team about any more in the notes.</p>}
      </div>
    </div>
  );
}
