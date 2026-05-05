import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Volume2,
  Footprints,
  Shield,
  PawPrint,
  Clock,
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

import estateWhiteOak from '@/assets/tier-estate-white-oak.jpg';
import olympicWhiteOak from '@/assets/tier-olympic-white-oak.jpg';
import vineyardWhiteOak from '@/assets/tier-vineyard-white-oak.jpg';
import suedeEuropeanOak from '@/assets/tier-suede-european-oak.jpg';

const colorways = [
  { name: 'Estate White Oak', code: 'STW035', image: estateWhiteOak, scene: 'Living Room' },
  { name: 'Olympic White Oak', code: 'STW053', image: olympicWhiteOak, scene: 'Cozy Living Room' },
  { name: 'Vineyard White Oak', code: 'STW138', image: vineyardWhiteOak, scene: 'Modern Kitchen' },
  { name: 'Suede European Oak', code: 'STW130', image: suedeEuropeanOak, scene: 'Home Office' },
];

const features = [
  { icon: Droplets, title: 'Waterproof', description: '100% waterproof polymer composite core' },
  { icon: Shield, title: 'AC6 Wear Rating', description: 'Exceptionally durable for ultra-luxury living' },
  { icon: Footprints, title: 'Heat Resistant', description: 'Stable under temperature change' },
  { icon: Volume2, title: '5G Click Install', description: 'Highly efficient locking system' },
  { icon: PawPrint, title: 'PVC-Free & Phthalate-Free', description: 'Cleaner indoor air, 100% recyclable' },
  { icon: Clock, title: 'UFLPA-Compliant', description: 'Made using solar energy' },
];

export function PremiumLVPShowcase() {
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
            TIER PVC-Free, Element Premier
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

      {/* Color carousel — large room scenes */}
      <div className="mb-6">
        <div className="relative aspect-[4/3] md:aspect-[16/10] rounded-xl overflow-hidden bg-muted">
          <AnimatePresence mode="wait">
            <motion.img
              key={current.code}
              src={current.image}
              alt={`${current.name} – ${current.scene}`}
              className="w-full h-full object-cover"
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.4 }}
            />
          </AnimatePresence>

          {/* Gradient overlay for legibility */}
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

          {/* Caption */}
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
            <p className="text-[10px] uppercase tracking-widest opacity-80">
              {current.code} · {current.scene}
            </p>
            <p className="font-serif text-lg md:text-xl font-medium">{current.name}</p>
          </div>

          {/* Arrows */}
          <button
            onClick={goPrev}
            aria-label="Previous color"
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            aria-label="Next color"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-background/85 text-[11px] font-medium">
            {activeColor + 1} / {colorways.length}
          </div>
        </div>

        {/* Thumbnail strip */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {colorways.map((c, idx) => (
            <button
              key={c.code}
              onClick={() => setActiveColor(idx)}
              className={`group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
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
          TIER Element is now available in the PVC-free Premier collection, an
          ultra-luxury larger sized profile boasting an exceptionally durable
          AC6 wear rating and highly efficient 5G click installation system.
          Premier profiles offer improved livability and reliability thanks to
          their wider, thicker, and longer size.
        </p>
        <p className="text-sm text-foreground leading-relaxed">
          Cutting-edge high-resolution direct digital replication technology
          gives TIER Element Premier a remarkably natural aesthetic with
          minimal repeat patterns. Its 100% recyclable polymer composite core
          with an integrated hardened ceramic coating is free of phthalates,
          exceptionally stable, waterproof, and heat resistant. Each large
          profile is UFLPA-compliant and made using solar energy.
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
              <span>TIER Element Premier Brochure</span>
              <Button variant="ghost" size="icon" onClick={() => setBrochureOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <iframe
              src="/brochures/tier-element-premier-brochure.pdf"
              className="w-full h-[75vh]"
              title="TIER Element Premier Brochure"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
