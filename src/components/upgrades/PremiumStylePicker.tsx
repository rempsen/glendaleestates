// Style → colour picker for premium carpet (San Lucas / Valter) and premium LVP (Synergy / TIER Element Premier).
// Step 1 picks the style; step 2 shows that style's full colour range as large swatches with an enlarged view.
// The value is the two stored strings (product name, colour text) so callers persist exactly what outputs print.
import { useState } from 'react';
import { Check, FileText, Maximize2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  colourLabel, findPremiumColour, findPremiumStyle, premiumStylesFor,
  type PremiumColour, type PremiumFamily, type PremiumStyle,
} from '@/lib/premiumProducts';

export interface PremiumChoice {
  productName: string;
  colour: string;
}

interface PremiumStylePickerProps {
  family: PremiumFamily;
  value: PremiumChoice;
  onChange: (next: PremiumChoice) => void;
  /** Tighter grid for narrow containers (the Upgrades area card). */
  compact?: boolean;
  /** Prefix for element ids / test hooks when several pickers are on one page. */
  idPrefix?: string;
}

export function PremiumStylePicker({ family, value, onChange, compact = false, idPrefix = family }: PremiumStylePickerProps) {
  const styles = premiumStylesFor(family);
  const style = findPremiumStyle(family, value.productName);
  const colour = findPremiumColour(style, value.colour);
  const [zoom, setZoom] = useState<{ style: PremiumStyle; colour: PremiumColour } | null>(null);
  const noun = family === 'carpet' ? 'carpet' : 'plank';

  const chooseStyle = (s: PremiumStyle) => {
    if (style?.id === s.id) return;
    onChange({ productName: s.productName, colour: '' });
  };

  return (
    <div className="space-y-4" data-testid={`${idPrefix}-premium-picker`} onClick={(e) => e.stopPropagation()}>
      {/* Step 1 — style */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">
          <span className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded-full bg-primary text-primary-foreground text-xs">1</span>
          Choose a {family === 'carpet' ? 'carpet style' : 'collection'}
          <span className="ml-2 text-xs font-normal text-muted-foreground">same upgrade price</span>
        </p>
        <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
          {styles.map((s) => {
            const selected = style?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                id={`${idPrefix}-style-${s.id}`}
                aria-pressed={selected}
                onClick={() => chooseStyle(s)}
                className={cn(
                  'group relative overflow-hidden rounded-xl border-2 text-left transition-all',
                  selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border hover:border-primary/50',
                )}
              >
                <div className={cn('overflow-hidden bg-muted', compact ? 'aspect-[16/9]' : 'aspect-[16/8]')}>
                  <img src={s.cover} alt={`${s.name} ${noun}`} loading="lazy" decoding="async"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-3">
                  <p className="font-semibold text-foreground leading-tight">
                    {s.name} <span className="text-xs font-normal text-muted-foreground">{s.code}</span>
                  </p>
                  {!compact && <p className="text-xs text-muted-foreground mt-0.5">{s.tagline}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{s.colours.length} colours</p>
                </div>
                {selected && (
                  <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — colour */}
      {style && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-medium text-foreground">
              <span className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded-full bg-primary text-primary-foreground text-xs">2</span>
              Choose your {style.name} colour
            </p>
            <div className="flex items-center gap-1">
              {style.brochurePath && (
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <a href={style.brochurePath} target="_blank" rel="noopener noreferrer">
                    <FileText className="w-3.5 h-3.5 mr-1" /> Brochure
                  </a>
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
                onClick={() => onChange({ productName: '', colour: '' })}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Change style
              </Button>
            </div>
          </div>
          <div className={cn('grid gap-3', compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4')}>
            {style.colours.map((c) => {
              const selected = colour?.id === c.id;
              return (
                <div key={c.id} className="relative">
                  <button
                    type="button"
                    id={`${idPrefix}-colour-${c.id}`}
                    aria-pressed={selected}
                    aria-label={`${style.name} ${colourLabel(c)}`}
                    onClick={() => onChange({ productName: style.productName, colour: colourLabel(c) })}
                    className={cn(
                      'w-full overflow-hidden rounded-xl border-2 text-left transition-all',
                      selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="aspect-square bg-muted overflow-hidden">
                      <img src={c.thumb} alt={`${style.name} ${c.name}`} loading="lazy" decoding="async"
                        className="w-full h-full object-cover" />
                    </div>
                    <div className="px-2 py-1.5">
                      <p className={cn('text-sm leading-tight', selected ? 'font-semibold text-primary' : 'text-foreground')}>{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">{c.code}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Enlarge ${c.name}`}
                    onClick={() => setZoom({ style, colour: c })}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-background/85 hover:bg-background shadow flex items-center justify-center"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  {selected && (
                    <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary flex items-center justify-center pointer-events-none">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {colour ? (
            <p className="mt-3 text-sm text-foreground" data-testid={`${idPrefix}-premium-summary`}>
              Selected: <span className="font-semibold">{style.productName} — {colourLabel(colour)}</span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-warning">Please choose a colour.</p>
          )}
        </div>
      )}

      <Dialog open={!!zoom} onOpenChange={(open) => { if (!open) setZoom(null); }}>
        <DialogContent className="max-w-3xl">
          {zoom && (
            <>
              <DialogHeader>
                <DialogTitle>{zoom.style.name} — {zoom.colour.name}</DialogTitle>
                <DialogDescription>{zoom.style.productName} · colour {zoom.colour.code}</DialogDescription>
              </DialogHeader>
              <img src={zoom.colour.full} alt={`${zoom.style.name} ${zoom.colour.name}, enlarged`}
                className="w-full max-h-[70vh] object-contain rounded-lg bg-muted" />
              <div className="flex justify-end">
                <Button type="button" onClick={() => {
                  onChange({ productName: zoom.style.productName, colour: colourLabel(zoom.colour) });
                  setZoom(null);
                }}>
                  <Check className="w-4 h-4 mr-1" /> Choose {zoom.colour.name}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
