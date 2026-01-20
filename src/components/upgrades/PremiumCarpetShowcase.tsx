import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Sparkles,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  PawPrint,
  Droplets,
  Clock,
  Footprints,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

import sanLucasHero from '@/assets/carpet-san-lucas-hero.jpg';
import sanLucasSpecs from '@/assets/carpet-san-lucas-specs.jpg';
import valterHero from '@/assets/carpet-valter-hero.jpg';
import valterSpecs from '@/assets/carpet-valter-specs.jpg';

interface CarpetProduct {
  id: string;
  name: string;
  code: string;
  tagline: string;
  description: string;
  images: { src: string; label: string }[];
  features: { icon: React.ElementType; title: string; description: string }[];
  specifications: { label: string; value: string }[];
  colorways: string[];
  warranties: { type: string; duration: string }[];
  brochurePath: string;
}

const carpetProducts: CarpetProduct[] = [
  {
    id: 'san-lucas',
    name: 'San Lucas',
    code: '8623',
    tagline: 'Dense Textured Loop with Herringbone Pattern',
    description: 'San Lucas introduces a uniquely dense and textured loop pile that creates added dimension and beauty underfoot while delivering a functional yet refined space. The small-scaled herringbone pattern allows for many styling choices.',
    images: [
      { src: sanLucasHero, label: 'Product Overview' },
      { src: sanLucasSpecs, label: 'Features & Specs' },
    ],
    features: [
      {
        icon: Layers,
        title: 'Patterned Loop',
        description: 'Unique herringbone texture with dense loop construction',
      },
      {
        icon: Sparkles,
        title: 'PureColor TwistX',
        description: 'Proprietary yarn system for lasting color',
      },
      {
        icon: PawPrint,
        title: 'Pet-Friendly',
        description: 'Lifetime pet stain protection included',
      },
      {
        icon: Shield,
        title: 'Stain Resistant',
        description: 'Lifetime stain resistance warranty',
      },
      {
        icon: Footprints,
        title: 'Stair Approved',
        description: 'Full stair warranty included',
      },
      {
        icon: Clock,
        title: '25 Year Wear',
        description: 'Long-lasting texture retention',
      },
    ],
    specifications: [
      { label: 'Construction', value: 'Patterned Loop' },
      { label: 'Fiber', value: '100% PureColor® SD TwistX Polyester' },
      { label: 'Weight', value: '40 oz.' },
      { label: 'Width', value: "12'" },
      { label: 'Backing', value: 'Polypropylene' },
      { label: 'Colors', value: '9' },
    ],
    colorways: [
      '6130', '6253', '6429', '8985'
    ],
    warranties: [
      { type: 'Stain', duration: 'Lifetime' },
      { type: 'Fade', duration: 'Lifetime' },
      { type: 'Pet', duration: 'Lifetime' },
      { type: 'Soil', duration: '25 Years' },
      { type: 'Wear', duration: '25 Years' },
      { type: 'Texture', duration: '25 Years' },
    ],
    brochurePath: '/brochures/carpet-san-lucas-brochure.pdf',
  },
  {
    id: 'valter',
    name: 'Valter',
    code: '8655',
    tagline: 'Multi-Level Cut Loop with Bamboo-Inspired Pattern',
    description: 'State-of-the-art tufting technology creates a high-contrast, multi-level cut loop pattern. The subtle bamboo foliage design features PureColor® with patented TwistX® technology for beautiful neutral tones.',
    images: [
      { src: valterHero, label: 'Product Overview' },
      { src: valterSpecs, label: 'Features & Specs' },
    ],
    features: [
      {
        icon: Layers,
        title: 'Multi-Level Cut Loop',
        description: 'Advanced tufting for dimensional texture',
      },
      {
        icon: Sparkles,
        title: 'Patented TwistX®',
        description: '3-ply construction for industry-leading durability',
      },
      {
        icon: Droplets,
        title: '50% More Yarn',
        description: 'Higher bundle density per square foot',
      },
      {
        icon: PawPrint,
        title: 'Pet Protection',
        description: 'Lifetime pet stain warranty',
      },
      {
        icon: Shield,
        title: 'Stain Resistant',
        description: 'Lifetime stain resistance warranty',
      },
      {
        icon: Footprints,
        title: 'Stair Warranty',
        description: 'Approved for stair installation',
      },
    ],
    specifications: [
      { label: 'Construction', value: 'Multi-Level Cut Loop' },
      { label: 'Fiber', value: '100% PureColor® Solution-Dyed PET TwistX®' },
      { label: 'Width', value: "12'" },
      { label: 'Backing', value: 'Woven Polypropylene' },
      { label: 'Pattern', value: '12" W x 9" L' },
      { label: 'Colors', value: '9' },
    ],
    colorways: [
      '8215 Sand Island', '8027 Oberon', '8095 Beacon',
      '8120 Prairie Grove', '8153 Point Break', '8172 Fortress',
      '8080 The Dunes', '8199 Rockaway', '8077 Sweet Spot',
    ],
    warranties: [
      { type: 'Stain', duration: 'Lifetime' },
      { type: 'Fade', duration: 'Lifetime' },
      { type: 'Pet', duration: 'Lifetime' },
      { type: 'Soil', duration: '25 Years' },
      { type: 'Wear', duration: '25 Years' },
      { type: 'Texture', duration: '25 Years' },
    ],
    brochurePath: '/brochures/carpet-valter-brochure.pdf',
  },
];

function CarpetProductCard({ product }: { product: CarpetProduct }) {
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-serif text-lg font-semibold text-foreground">
            {product.code} {product.name}
          </h4>
          <p className="text-sm text-muted-foreground">{product.tagline}</p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          className="gap-2"
          onClick={() => setBrochureOpen(true)}
        >
          <FileText className="w-4 h-4" />
          View
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Image Carousel */}
        <div className="space-y-2">
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
            <motion.img
              key={activeImage}
              src={product.images[activeImage].src}
              alt={product.images[activeImage].label}
              className="w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            
            {/* Navigation */}
            {product.images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImage((prev) => (prev === 0 ? product.images.length - 1 : prev - 1))}
                  className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setActiveImage((prev) => (prev === product.images.length - 1 ? 0 : prev + 1))}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </>
            )}
            
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-background/90 text-[10px] font-medium">
              {product.images[activeImage].label}
            </div>
          </div>
          
          {/* Thumbnails */}
          <div className="flex gap-1.5 justify-center">
            {product.images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImage(idx)}
                className={`w-12 h-9 rounded overflow-hidden border-2 transition-all ${
                  activeImage === idx ? 'border-primary ring-1 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
              >
                <img src={img.src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Features & Specs */}
        <div className="space-y-3">
          <p className="text-xs text-foreground leading-relaxed">
            {product.description}
          </p>
          
          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-2">
            {product.features.slice(0, 4).map((feature) => (
              <div 
                key={feature.title}
                className="flex items-start gap-1.5 p-1.5 rounded bg-muted/50"
              >
                <feature.icon className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-foreground leading-tight">{feature.title}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Warranties */}
          <div className="pt-2 border-t border-border">
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <Shield className="w-3 h-3 text-primary" />
              {product.warranties.slice(0, 3).map((w, idx) => (
                <span key={w.type} className="flex items-center gap-1">
                  <span className="font-medium">{w.duration}</span> {w.type}
                  {idx < 2 && <span className="text-muted-foreground">•</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Brochure Dialog */}
      <Dialog open={brochureOpen} onOpenChange={setBrochureOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center justify-between">
              <span>{product.name} Product Sheet</span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setBrochureOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <iframe 
              src={product.brochurePath}
              className="w-full h-[75vh]"
              title={`${product.name} Brochure`}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PremiumCarpetShowcase() {
  return (
    <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/5 to-secondary/5 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <span className="text-xs font-medium uppercase tracking-wide text-accent">Premium Carpet Options</span>
        </div>
        <h3 className="font-serif text-xl font-semibold text-foreground">
          Engineered Floors Premium Carpets
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Upgrade your bedrooms and stairs with these premium carpet options featuring advanced TwistX® technology
        </p>
      </div>

      {/* Products */}
      <div className="space-y-4">
        {carpetProducts.map((product) => (
          <CarpetProductCard key={product.id} product={product} />
        ))}
      </div>

      {/* Bottom Banner */}
      <div className="mt-6 p-4 rounded-xl bg-accent/10 border border-accent/20">
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-accent" />
            <span className="font-medium">Lifetime Warranties</span>
          </span>
          <span className="text-muted-foreground">•</span>
          <span>Stain Resistant</span>
          <span className="text-muted-foreground">•</span>
          <span>Pet-Friendly</span>
          <span className="text-muted-foreground">•</span>
          <span>Stair Approved</span>
        </div>
      </div>
    </div>
  );
}
