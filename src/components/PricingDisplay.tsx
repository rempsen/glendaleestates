import { windowPricing } from '@/lib/mockData';

interface PricingDisplayProps {
  additionalWindows: number;
  patioDoors: number;
}

export function PricingDisplay({ additionalWindows, patioDoors }: PricingDisplayProps) {
  const windowsSubtotal = additionalWindows * windowPricing.additionalWindow;
  const patioSubtotal = patioDoors * windowPricing.patioDoor;
  const subtotal = windowsSubtotal + patioSubtotal;
  const gst = subtotal * windowPricing.gst;
  const total = subtotal + gst;

  if (subtotal === 0) {
    return null;
  }

  return (
    <div className="p-4 rounded-xl bg-secondary/50 border border-border">
      <h4 className="font-medium text-foreground mb-3">Window Covering Extensions</h4>
      
      <div className="space-y-2 text-sm">
        {additionalWindows > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Additional Windows ({additionalWindows} × ${windowPricing.additionalWindow})
            </span>
            <span className="font-medium">${windowsSubtotal.toFixed(2)}</span>
          </div>
        )}
        
        {patioDoors > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Patio Door Panel Tracks ({patioDoors} × ${windowPricing.patioDoor})
            </span>
            <span className="font-medium">${patioSubtotal.toFixed(2)}</span>
          </div>
        )}
        
        <div className="border-t border-border pt-2 mt-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">GST (5%)</span>
            <span>${gst.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground pt-1">
            <span>Total</span>
            <span className="text-primary">${total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
