import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Droplets, 
  Volume2, 
  Footprints, 
  Shield, 
  PawPrint, 
  Clock,
  Sparkles,
  FileText,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import advantageColors from '@/assets/advantage-lvp-colors.jpg';
import advantageFeatures from '@/assets/advantage-lvp-features.jpg';
import advantageRoom from '@/assets/advantage-lvp-room.png';

const features = [
  {
    icon: Droplets,
    title: 'Waterproof',
    description: 'Lifetime waterproof warranty for worry-free living',
  },
  {
    icon: Footprints,
    title: 'Soft Underfoot',
    description: 'Warm, quiet, and incredibly comfortable',
  },
  {
    icon: Volume2,
    title: 'Noise Reduction',
    description: 'Built-in 1.5mm underlayment for sound dampening',
  },
  {
    icon: Shield,
    title: 'Superior Scratch Resistance',
    description: '20 mil wear layer for lasting durability',
  },
  {
    icon: PawPrint,
    title: 'Pet-Friendly',
    description: '15 Year Pet Scratch & Lifetime Pet Stain warranty',
  },
  {
    icon: Clock,
    title: 'Fast Installation',
    description: 'Välinge Angle Tap locking for easy install',
  },
];

const colorways = [
  '2001 Autumn', '2002 Chestnut Pointe', '2003 Sedgwick',
  '2004 Almond', '2005 Brookstone', '2006 Ashford',
  '2007 Sherwood', '2008 Harmony Grove', '2009 Wicker',
  '2010 Oak Ridge', '2011 Knightbridge', '2012 Hamlet',
];

const specifications = [
  { label: 'Size', value: '7" × 48"' },
  { label: 'Total Thickness', value: '8.0 mm' },
  { label: 'Wear Layer', value: '20 mil' },
  { label: 'Underlayment', value: '1.5 mm attached' },
  { label: 'Embossing', value: 'EIR - Embossed in Register' },
  { label: 'Edge', value: 'Pressed Bevel' },
];

export function PremiumLVPShowcase() {
  const [brochureOpen, setBrochureOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  
  const images = [advantageRoom, advantageColors, advantageFeatures];
  const imageLabels = ['Room Preview', 'Available Colors', 'Specifications'];

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wide text-primary">Premium Upgrade</span>
          </div>
          <h3 className="font-serif text-xl font-semibold text-foreground">
            Engineered Floors Advantage Series
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            PureGrain Comfort - Luxury meets longevity in every step
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          className="gap-2"
          onClick={() => setBrochureOpen(true)}
        >
          <FileText className="w-4 h-4" />
          View Brochure
        </Button>
      </div>

      {/* Main Content */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Image Carousel */}
        <div className="space-y-3">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
            <motion.img
              key={activeImage}
              src={images[activeImage]}
              alt={imageLabels[activeImage]}
              className="w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            />
            
            {/* Navigation Arrows */}
            <button
              onClick={() => setActiveImage((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveImage((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/80 hover:bg-background shadow-lg transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            
            {/* Image Label */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/90 text-xs font-medium">
              {imageLabels[activeImage]}
            </div>
          </div>
          
          {/* Thumbnail Navigation */}
          <div className="flex gap-2 justify-center">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImage(idx)}
                className={`w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                  activeImage === idx ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Features & Info */}
        <div className="space-y-4">
          {/* Key Description */}
          <p className="text-sm text-foreground leading-relaxed">
            Bring the serenity of nature indoors with PureGrain Comfort. Its lifelike texture and rich 
            tones evoke the tranquility of a woodland retreat. Engineered for luxury with warm, quiet 
            comfort underfoot.
          </p>
          
          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature) => (
              <div 
                key={feature.title}
                className="flex items-start gap-2 p-2 rounded-lg bg-background/50"
              >
                <feature.icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">{feature.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Specifications */}
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Specifications</h4>
            <div className="grid grid-cols-3 gap-2">
              {specifications.map((spec) => (
                <div key={spec.label} className="text-center p-2 rounded-lg bg-background/50">
                  <p className="text-[10px] text-muted-foreground">{spec.label}</p>
                  <p className="text-xs font-medium text-foreground">{spec.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Colorways */}
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">12 Colorways Available</h4>
            <div className="flex flex-wrap gap-1">
              {colorways.map((color) => (
                <span 
                  key={color}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {color}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Warranties Banner */}
      <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-medium">Lifetime Residential Warranty</span>
          </span>
          <span className="text-muted-foreground">•</span>
          <span>Lifetime Waterproof</span>
          <span className="text-muted-foreground">•</span>
          <span>Lifetime Pet Stains</span>
          <span className="text-muted-foreground">•</span>
          <span>15 Year Pet Scratch</span>
        </div>
      </div>

      {/* Brochure Dialog */}
      <Dialog open={brochureOpen} onOpenChange={setBrochureOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center justify-between">
              <span>Engineered Floors Advantage Series Brochure</span>
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
              src="/brochures/advantage-lvp-brochure.pdf"
              className="w-full h-[75vh]"
              title="Advantage Series Brochure"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
