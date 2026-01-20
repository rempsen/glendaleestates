import { 
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  AREA_DEFINITIONS,
  UPGRADE_MATERIALS,
} from '@/lib/upgradeCostData';
import { heatedFloorPricing } from '@/lib/mockData';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';

interface UpgradePricingSummaryProps {
  unitTypeCode: string | null;
  selectedFloor?: '1' | '2' | null;
  areaUpgrades: AreaUpgradeSelection[];
  heatedFloorBathrooms?: number;
  bathroomTileSelected?: boolean;
  backsplashGrout?: BacksplashGroutSelection;
}

export function UpgradePricingSummary({
  unitTypeCode,
  selectedFloor,
  areaUpgrades,
  heatedFloorBathrooms = 0,
  bathroomTileSelected = false,
  backsplashGrout,
}: UpgradePricingSummaryProps) {
  // Use dynamic pricing from database
  const { calculateTotalUpgradeCost, calculateBacksplashGroutPrice, gstRate } = useDynamicPricing();
  // Determine effective unit code
  const effectiveUnitCode = unitTypeCode 
    ? (['G', 'H'].includes(unitTypeCode.toUpperCase()) && selectedFloor 
        ? `${unitTypeCode}-${selectedFloor}` 
        : unitTypeCode)
    : null;

  // Calculate area upgrade totals
  const upgradeCalc = effectiveUnitCode && areaUpgrades.length > 0
    ? calculateTotalUpgradeCost(effectiveUnitCode, areaUpgrades)
    : { subtotal: 0, gst: 0, total: 0, lineItems: [] };

  // Calculate heated floor costs (only if bathroom tile selected)
  const heatedFloorSubtotal = bathroomTileSelected ? heatedFloorBathrooms * heatedFloorPricing.perBathroom : 0;
  const heatedFloorGst = heatedFloorSubtotal * gstRate;

  // Calculate backsplash grout color change costs
  const groutPrice = backsplashGrout?.enabled ? calculateBacksplashGroutPrice() : null;
  const groutSubtotal = groutPrice?.markedUpCost || 0;
  const groutGst = groutPrice?.gst || 0;

  // Grand totals (window coverings now handled separately in window step)
  const grandSubtotal = upgradeCalc.subtotal + heatedFloorSubtotal + groutSubtotal;
  const grandGst = upgradeCalc.gst + heatedFloorGst + groutGst;
  const grandTotal = grandSubtotal + grandGst;

  if (grandSubtotal === 0) {
    return null;
  }

  return (
    <div className="p-5 rounded-xl bg-secondary/50 border border-border">
      <h4 className="font-semibold text-foreground mb-4">Upgrade Pricing Summary</h4>
      
      <div className="space-y-4">
        {/* Area Upgrades Section */}
        {upgradeCalc.lineItems.length > 0 && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Flooring & Tile Upgrades</h5>
            <div className="space-y-2 text-sm">
              {areaUpgrades.map(selection => {
                const area = AREA_DEFINITIONS.find(a => a.id === selection.areaId);
                const material = UPGRADE_MATERIALS.find(m => m.id === selection.materialType);
                const lineItem = upgradeCalc.lineItems.find(l => l.areaName === area?.name);

                return (
                  <div key={selection.areaId} className="flex justify-between">
                    <div className="text-muted-foreground">
                      <span>{area?.name}</span>
                      <span className="text-xs ml-1">
                        ({material?.name})
                      </span>
                      {selection.productName && (
                        <span className="text-xs block ml-4 text-muted-foreground/70">
                          {selection.productName}{selection.productColor ? ` - ${selection.productColor}` : ''}
                        </span>
                      )}
                    </div>
                    <span className="font-medium">${lineItem?.markedUpCost.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Heated Floors Section */}
        {heatedFloorSubtotal > 0 && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Heated Floors</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Heated Tile Floor ({heatedFloorBathrooms} bathroom{heatedFloorBathrooms > 1 ? 's' : ''} × ${heatedFloorPricing.perBathroom.toLocaleString()})
                </span>
                <span className="font-medium">${heatedFloorSubtotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Backsplash Grout Color Section */}
        {backsplashGrout?.enabled && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Backsplash Grout Color</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <div className="text-muted-foreground">
                  <span>Custom Grout Color</span>
                  {backsplashGrout.groutColor && (
                    <span className="text-xs block ml-4 text-muted-foreground/70">
                      Color: {backsplashGrout.groutColor}
                    </span>
                  )}
                </div>
                <span className="font-medium">${groutSubtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-border pt-3 mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal (pre-GST)</span>
            <span>${grandSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GST (5%)</span>
            <span>${grandGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground pt-2 text-base">
            <span>Total (incl. GST)</span>
            <span className="text-primary">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          * A 10% material overage is allowed on all quoted amounts.
        </p>
      </div>
    </div>
  );
}
