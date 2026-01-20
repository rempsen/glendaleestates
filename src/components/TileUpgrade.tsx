import { cn } from '@/lib/utils';
import { Check, Sparkles, Flame, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { bathroomTileUpgradePricing, porcelainTileProduct } from '@/lib/mockData';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';

interface TileUpgradeProps {
  unitTypeCode: string | null;
  bathroomTileSelected: boolean;
  heatedFloorBathrooms: number;
  maxBathrooms: number;
  onToggleTile: () => void;
  onHeatedFloorChange: (count: number) => void;
}

export function TileUpgrade({ 
  unitTypeCode, 
  bathroomTileSelected, 
  heatedFloorBathrooms,
  maxBathrooms,
  onToggleTile,
  onHeatedFloorChange
}: TileUpgradeProps) {
  // Use dynamic pricing from database
  const { getHeatedFloorPrice, gstRate } = useDynamicPricing();
  const heatedFloorPerBathroom = getHeatedFloorPrice();
  
  const pricing = unitTypeCode ? bathroomTileUpgradePricing[unitTypeCode] : null;
  
  if (!pricing) {
    return (
      <div className="p-4 rounded-xl bg-muted/50 border border-border text-center">
        <p className="text-muted-foreground">
          Please enter your unit number to see tile upgrade pricing.
        </p>
      </div>
    );
  }

  const tileGst = pricing.ensuitePrice * gstRate;
  const tileTotalPerBath = pricing.ensuitePrice + tileGst;
  
  const heatedGst = heatedFloorPerBathroom * gstRate;
  const heatedTotalPerBath = heatedFloorPerBathroom + heatedGst;

  return (
    <div className="space-y-6">
      {/* Bathroom Floor Tile Upgrade */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onToggleTile}
        className={cn(
          "relative w-full p-5 rounded-xl border-2 text-left transition-all duration-200",
          bathroomTileSelected
            ? "border-accent bg-accent/10"
            : "border-border bg-card hover:border-accent/50"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className={cn(
              "w-4 h-4",
              bathroomTileSelected ? "text-accent" : "text-muted-foreground"
            )} />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Premium Upgrade
            </span>
          </div>
          
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
            bathroomTileSelected
              ? "bg-accent border-accent"
              : "border-border"
          )}>
            {bathroomTileSelected && <Check className="w-3 h-3 text-accent-foreground" />}
          </div>
        </div>
        
        <h4 className={cn(
          "font-serif text-lg font-medium mb-1",
          bathroomTileSelected ? "text-accent" : "text-foreground"
        )}>
          {porcelainTileProduct.name}
        </h4>
        
        <p className="text-sm text-muted-foreground mb-3">
          {porcelainTileProduct.description}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {porcelainTileProduct.features.map((feature) => (
            <span key={feature} className="px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground">
              {feature}
            </span>
          ))}
        </div>
        
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "text-xl font-semibold",
            bathroomTileSelected ? "text-accent" : "text-foreground"
          )}>
            ${pricing.ensuitePrice.toLocaleString()}
          </span>
          <span className="text-sm text-muted-foreground">
            per ensuite + GST
          </span>
        </div>

        {bathroomTileSelected && (
          <span className="mt-3 inline-block text-xs font-medium text-accent">
            ✓ Upgrade to Porcelain Tile selected
          </span>
        )}
      </motion.button>

      {/* Heated Floor Option - Only shown when tile is selected */}
      <AnimatePresence>
        {bathroomTileSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 rounded-xl border-2 border-border bg-card">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Flame className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h4 className="font-serif text-lg font-medium text-foreground">
                    Heated Tile Floor
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Add radiant floor heating to your upgraded porcelain tile bathrooms
                  </p>
                </div>
              </div>

              {/* Karma Permission Warning */}
              <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-warning">
                    <strong>Important:</strong> Heated floor installation requires Karma's permission to run the electrical. Our team will coordinate this for you.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  Number of bathrooms with heated floors:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (heatedFloorBathrooms > 0) {
                        onHeatedFloorChange(heatedFloorBathrooms - 1);
                      }
                    }}
                    className="w-8 h-8 rounded-lg border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
                    disabled={heatedFloorBathrooms === 0}
                  >
                    -
                  </button>
                  <span className="w-8 text-center font-medium">{heatedFloorBathrooms}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (heatedFloorBathrooms < maxBathrooms) {
                        onHeatedFloorChange(heatedFloorBathrooms + 1);
                      }
                    }}
                    className="w-8 h-8 rounded-lg border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
                    disabled={heatedFloorBathrooms >= maxBathrooms}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold text-foreground">
                  ${heatedFloorPerBathroom.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">
                  per bathroom + GST
                </span>
              </div>

              {heatedFloorBathrooms > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {heatedFloorBathrooms} bathroom{heatedFloorBathrooms > 1 ? 's' : ''} × ${heatedFloorPerBathroom.toLocaleString()}
                    </span>
                    <span className="font-medium">
                      ${(heatedFloorBathrooms * heatedFloorPerBathroom).toLocaleString()} + GST
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
