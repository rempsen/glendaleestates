import { useState } from 'react';
import {
  Droplets,
  Volume2,
  Footprints,
  Shield,
  PawPrint,
  Clock,
  FileText,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const features = [
  {
    icon: Droplets,
    title: 'Waterproof',
    description: '100% waterproof polymer composite core',
  },
  {
    icon: Shield,
    title: 'AC6 Wear Rating',
    description: 'Exceptionally durable for ultra-luxury living',
  },
  {
    icon: Footprints,
    title: 'Heat Resistant',
    description: 'Stable under temperature change',
  },
  {
    icon: Volume2,
    title: '5G Click Install',
    description: 'Highly efficient locking system',
  },
  {
    icon: PawPrint,
    title: 'PVC-Free & Phthalate-Free',
    description: 'Cleaner indoor air, 100% recyclable',
  },
  {
    icon: Clock,
    title: 'UFLPA-Compliant',
    description: 'Made using solar energy',
  },
];

export function PremiumLVPShowcase() {
  const [brochureOpen, setBrochureOpen] = useState(false);

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

        {/* Features Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex items-start gap-2 p-3 rounded-lg bg-background/50"
            >
              <feature.icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">{feature.title}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{feature.description}</p>
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
