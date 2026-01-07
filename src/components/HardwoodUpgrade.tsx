import { hardwoodUpgradePricing, hardwoodProduct, windowPricing } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { Check, TreeDeciduous } from 'lucide-react';
import { motion } from 'framer-motion';

interface HardwoodUpgradeProps {
  unitTypeCode: string | null;
  selected: boolean;
  onToggle: () => void;
}

export function HardwoodUpgrade({ unitTypeCode, selected, onToggle }: HardwoodUpgradeProps) {
  const pricing = unitTypeCode ? hardwoodUpgradePricing[unitTypeCode] : null;
  
  if (!pricing) {
    return (
      <div className="p-5 rounded-xl border border-border bg-muted/30 text-center">
        <p className="text-muted-foreground text-sm">
          Please enter your unit number in Step 1 to see hardwood upgrade pricing.
        </p>
      </div>
    );
  }

  const gst = pricing.price * windowPricing.gstRate;
  const total = pricing.price + gst;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onToggle}
      className={cn(
        "w-full text-left p-6 rounded-xl border-2 transition-all duration-200",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <TreeDeciduous className={cn(
              "w-5 h-5",
              selected ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Premium Flooring Upgrade
            </span>
          </div>
          
          <h4 className={cn(
            "font-serif text-xl font-medium mb-2",
            selected ? "text-primary" : "text-foreground"
          )}>
            {hardwoodProduct.name}
          </h4>
          
          <p className="text-sm text-muted-foreground mb-4">
            {hardwoodProduct.description}
          </p>

          <div className="space-y-1 text-sm mb-4">
            {hardwoodProduct.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-muted-foreground">
                <Check className="w-3 h-3 text-primary" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{pricing.description}</span>
              <span className="font-medium">${pricing.price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">GST (5%)</span>
              <span>${gst.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border">
              <span>Total (incl. GST)</span>
              <span className="text-primary">${total.toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div className={cn(
          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0 mt-1",
          selected
            ? "bg-primary border-primary"
            : "border-border"
        )}>
          {selected && <Check className="w-4 h-4 text-primary-foreground" />}
        </div>
      </div>
      
      {selected && (
        <div className="mt-4 pt-4 border-t border-primary/20">
          <span className="text-sm font-medium text-primary">
            ✓ Hardwood upgrade will be added to your order total
          </span>
        </div>
      )}
    </motion.button>
  );
}
