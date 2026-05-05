import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Volume2,
  Shield,
  PawPrint,
  Layers,
  Sparkles,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import toffeeRoom from '@/assets/synergy-toffee-room.jpg';
import doveSwatch from '@/assets/synergy-dove.jpg';
import linenSwatch from '@/assets/synergy-linen.jpg';
import wheatFieldSwatch from '@/assets/synergy-wheat-field.jpg';
import toffeeSwatch from '@/assets/synergy-toffee.jpg';
import woodcraftSwatch from '@/assets/synergy-woodcraft.jpg';
import driftwoodSwatch from '@/assets/synergy-driftwood.jpg';

const colorways = [
  { name: 'Toffee', code: 'RVISYPRTOFF', image: toffeeSwatch },
  { name: 'Dove', code: 'RVISYPRDOVE', image: doveSwatch },
  { name: 'Linen', code: 'RVISYPRLINE', image: linenSwatch },
  { name: 'Wheat Field', code: 'RVISYPRWHEA', image: wheatFieldSwatch },
  { name: 'Woodcraft', code: 'RVISYPRWOOD', image: woodcraftSwatch },
  { name: 'Driftwood', code: 'RVISYPRDRIF', image: driftwoodSwatch },
];

const features = [
  { icon: Droplets, title: '100% Waterproof', description: 'Worry-free in any room' },
  { icon: Shield, title: 'Commercial Wear Layer', description: 'Long-lasting beauty & performance' },
  { icon: Layers, title: 'Pre-Attached Cork', description: 'Added warmth and quieter rooms' },
  { icon: Sparkles, title: 'Authentic Visuals', description: 'Embossed, register-textured planks' },
  { icon: PawPrint, title: 'Antimicrobial Surface', description: 'Promotes a healthier home' },
  { icon: Volume2, title: 'Uniclic Locking System', description: 'Effortless install & repair' },
];

export function PremiumLVPSynergyShowcase() {
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [activeColor, setActiveColor] = useState(0);

  const goPrev = () => setActiveColor((p) => (p === 0 ? colorways.length - 1 : p - 1));
  const goNext = () => setActiveColor((p) => (p === colorways.length - 1 ? 0 : p + 1));

  const current = colorways[activeColor];

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h3 className="font-serif text-xl font-semibold text-foreground">
            Premium Upgrade - LVP
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Richmond Synergy Premium Plank Collection
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 flex-shrink-0"
          onClick={() => setBrochureOpen(true)}
        >
          <FileText className="w-4 h-4" />
          View Brochure
        </Button>
      </div>

      {/* Hero room scene */}
      <div className="relative aspect-[4/3] sm:aspect-[16/9] rounded-xl overflow-hidden bg-muted mb-3">
        <img
          src={toffeeRoom}
          alt="Synergy Premium Plank in Toffee – bedroom scene"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 sm:h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-white">
          <p className="text-[10px] uppercase tracking-widest opacity-80">Featured · Bedroom</p>
          <p className="font-serif text-base sm:text-lg md:text-xl font-medium">Toffee · RVISYPRTOFF</p>
        </div>
      </div>

      {/* Color carousel — plank swatches */}
      <div className="mb-6">
        <div className="relative aspect-[4/3] sm:aspect-[16/9] rounded-xl overflow-hidden bg-muted">
          <AnimatePresence mode="wait">
            <motion.img
              key={current.code}
              src={current.image}
              alt={`${current.name} plank swatch`}
              className="w-full h-full object-cover"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
            />
          </AnimatePresence>

          <div className="absolute inset-x-0 bottom-0 h-20 sm:h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-white">
            <p className="text-[10px] uppercase tracking-widest opacity-80">{current.code}</p>
            <p className="font-serif text-base sm:text-lg md:text-xl font-medium">{current.name}</p>
          </div>

          <button
            onClick={goPrev}
            aria-label="Previous color"
            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-full bg-background/85 hover:bg-background shadow-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            aria-label="Next color"
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center rounded-full bg-background/85 hover:bg-background shadow-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 px-2.5 py-1 rounded-full bg-background/85 text-[11px] font-medium">
            {activeColor + 1} / {colorways.length}
          </div>
        </div>

        {/* Thumbnail strip — horizontal scroll on mobile, grid on larger screens */}
        <div
          className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory sm:grid sm:grid-cols-6 sm:overflow-visible sm:mx-0 sm:px-0"
          role="tablist"
          aria-label="Colorways"
        >
          {colorways.map((c, idx) => (
            <button
              key={c.code}
              onClick={() => setActiveColor(idx)}
              role="tab"
              aria-selected={activeColor === idx}
              className={`group relative flex-shrink-0 w-20 sm:w-auto aspect-[4/3] snap-start rounded-lg overflow-hidden border-2 transition-all ${
                activeColor === idx
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50'
              }`}
              aria-label={c.name}
            >
              <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-background/90 px-1 py-0.5">
                <p className="text-[9px] md:text-[10px] font-medium text-foreground truncate text-center">
                  {c.name}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed">
          What classifies these new Synergy collections as &ldquo;premium&rdquo; is the elevated
          and realistic visuals, which are enhanced by the embossed and register texturing and the
          four-sided colour matched bevels. The updated décor options feature the perfect blend of
          light modern looks as well as some richer and more classic earthtones.
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          Synergy Premium is 100% waterproof and features a commercially rated wear layer,
          ensuring long-lasting beauty and performance in any residential or light commercial
          areas. The pre-attached cork underlayment provides added warmth and helps create a
          quieter space.
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          Synergy Premium also features a high-performance Uniclic locking system, which provides
          superior locking strength, as well as effortless installation and repair.
        </p>

        {/* Features */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-2 p-3 rounded-lg bg-background/50"
            >
              <feature.icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">{feature.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Brochure Dialog */}
      <Dialog open={brochureOpen} onOpenChange={setBrochureOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center justify-between">
              <span>Synergy Premium Plank Brochure</span>
              <Button variant="ghost" size="icon" onClick={() => setBrochureOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <iframe
              src="/brochures/synergy-premium-plank-brochure.pdf"
              className="w-full h-[75vh]"
              title="Synergy Premium Plank Brochure"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
