import { windowPricing, hardwoodUpgradePricing } from '@/lib/mockData';

interface PricingDisplayProps {
  additionalWindows: number;
  patioDoors: number;
  hardwoodUpgradeSelected?: boolean;
  unitTypeCode?: string | null;
}

export function PricingDisplay({ 
  additionalWindows, 
  patioDoors, 
  hardwoodUpgradeSelected = false,
  unitTypeCode = null
}: PricingDisplayProps) {
  const windowsSubtotal = additionalWindows * windowPricing.additionalWindow;
  const patioSubtotal = patioDoors * windowPricing.patioDoor;
  const windowSubtotal = windowsSubtotal + patioSubtotal;
  
  const hardwoodPricing = unitTypeCode && hardwoodUpgradeSelected ? hardwoodUpgradePricing[unitTypeCode] : null;
  const hardwoodSubtotal = hardwoodPricing?.price || 0;
  
  const subtotal = windowSubtotal + hardwoodSubtotal;
  const gst = subtotal * windowPricing.gstRate;
  const total = subtotal + gst;

  if (subtotal === 0) {
    return null;
  }

  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border">
      <h4 className="font-medium text-foreground mb-3">Upgrade Pricing Summary</h4>
      
      <div className="space-y-2 text-sm">
        {additionalWindows > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Additional Windows ({additionalWindows} × ${windowPricing.additionalWindow})
            </span>
            <span className="font-medium">${windowsSubtotal.toLocaleString()}</span>
          </div>
        )}
        
        {patioDoors > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Patio Door Panel Tracks ({patioDoors} × ${windowPricing.patioDoor})
            </span>
            <span className="font-medium">${patioSubtotal.toLocaleString()}</span>
          </div>
        )}
        
        {hardwoodPricing && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {hardwoodPricing.description}
            </span>
            <span className="font-medium">${hardwoodSubtotal.toLocaleString()}</span>
          </div>
        )}
        
        <div className="border-t border-border pt-2 mt-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal (pre-GST)</span>
            <span>${subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST (5%)</span>
            <span>${gst.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground pt-1">
            <span>Total (incl. GST)</span>
            <span className="text-primary">${total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
