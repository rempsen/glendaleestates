import { 
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  AREA_DEFINITIONS,
  UPGRADE_MATERIALS,
} from '@/lib/upgradeCostData';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';

interface WindowCoveringsData {
  additionalWindowsQty: number;
  patioDoorsQty: number;
  automatedWindowsQty: number;
}

interface UpgradePricingSummaryProps {
  unitTypeCode: string | null;
  selectedFloor?: '1' | '2' | null;
  areaUpgrades: AreaUpgradeSelection[];
  backsplashGrout?: BacksplashGroutSelection;
  stairLvpUpgradeSelected?: boolean;
  windowCoverings?: WindowCoveringsData;
  upgradeComments?: string;
  onUpgradeCommentsChange?: (comments: string) => void;
  showTitle?: boolean;
  compact?: boolean;
  bathroomTileSelected?: boolean;
  heatedFloorBathrooms?: number;
  customTiledShower?: boolean;
}

export function UpgradePricingSummary({
  unitTypeCode,
  selectedFloor,
  areaUpgrades,
  backsplashGrout,
  stairLvpUpgradeSelected = false,
  windowCoverings,
  upgradeComments = '',
  onUpgradeCommentsChange,
  showTitle = true,
  compact = false,
}: UpgradePricingSummaryProps) {
  // Use dynamic pricing from database
  const { 
    calculateTotalUpgradeCost, 
    calculateBacksplashGroutPrice, 
    gstRate, 
    getHeatedFloorPrice,
    getStairLvpUpgradePrice,
    getAdditionalWindowPrice,
    getPatioDoorPrice,
    getAutomatedMotorPrice,
  } = useDynamicPricing();
  
  // Get dynamic prices
  const heatedFloorPerBathroom = getHeatedFloorPrice();
  const stairLvpPrice = getStairLvpUpgradePrice();
  const additionalWindowPrice = getAdditionalWindowPrice();
  const patioDoorPrice = getPatioDoorPrice();
  const automatedMotorPrice = getAutomatedMotorPrice();
  
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

  // Calculate heated floor costs from area upgrades that have heatedFloor enabled
  const heatedFloorAreas = areaUpgrades.filter(
    s => s.heatedFloor && ['guestBathroom', 'masterEnsuite'].includes(s.areaId)
  );
  const heatedFloorSubtotal = heatedFloorAreas.length * heatedFloorPerBathroom;

  // Calculate backsplash grout color change costs
  const groutPrice = backsplashGrout?.enabled ? calculateBacksplashGroutPrice() : null;
  const groutSubtotal = groutPrice?.markedUpCost || 0;

  // Calculate stair LVP upgrade cost
  const stairLvpSubtotal = stairLvpUpgradeSelected ? stairLvpPrice : 0;

  // Calculate window coverings costs
  const windowAdditionalSubtotal = (windowCoverings?.additionalWindowsQty || 0) * additionalWindowPrice;
  const windowPatioSubtotal = (windowCoverings?.patioDoorsQty || 0) * patioDoorPrice;
  const windowAutomationSubtotal = (windowCoverings?.automatedWindowsQty || 0) * automatedMotorPrice;
  const windowCoveringsSubtotal = windowAdditionalSubtotal + windowPatioSubtotal + windowAutomationSubtotal;

  // Grand totals (all upgrades combined)
  const grandSubtotal = upgradeCalc.subtotal + heatedFloorSubtotal + groutSubtotal + stairLvpSubtotal + windowCoveringsSubtotal;
  const grandGst = grandSubtotal * gstRate;
  const grandTotal = grandSubtotal + grandGst;

  // Check if there are any upgrades to display
  const hasFlooringUpgrades = upgradeCalc.lineItems.length > 0;
  const hasHeatedFloors = heatedFloorSubtotal > 0;
  const hasGroutChange = backsplashGrout?.enabled;
  const hasStairUpgrade = stairLvpUpgradeSelected;
  const hasWindowUpgrades = windowCoveringsSubtotal > 0;

  const hasAnyUpgrades = hasFlooringUpgrades || hasHeatedFloors || hasGroutChange || hasStairUpgrade || hasWindowUpgrades;

  if (!hasAnyUpgrades) {
    return null;
  }

  return (
    <div className={`p-5 rounded-xl bg-secondary/50 border border-border ${compact ? 'space-y-3' : ''}`}>
      {showTitle && (
        <h4 className="font-semibold text-foreground mb-4 text-lg">Complete Upgrade Summary</h4>
      )}
      
      <div className="space-y-4">
        {/* Stair LVP Upgrade Section */}
        {hasStairUpgrade && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Stair Flooring Upgrade</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  LVP with Custom Stair Nosings
                </span>
                <span className="font-medium">${stairLvpSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        )}

        {/* Grout Color Change Section */}
        {hasGroutChange && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Backsplash Grout</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <div className="text-muted-foreground">
                  <span>Custom Grout Color</span>
                  {backsplashGrout?.groutColor && (
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

        {/* Window Coverings Section */}
        {hasWindowUpgrades && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Window Coverings</h5>
            <div className="space-y-2 text-sm">
              {(windowCoverings?.additionalWindowsQty || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Additional Windows ({windowCoverings?.additionalWindowsQty} × ${additionalWindowPrice.toFixed(2)})
                  </span>
                  <span className="font-medium">${windowAdditionalSubtotal.toFixed(2)}</span>
                </div>
              )}
              {(windowCoverings?.patioDoorsQty || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Patio Door Panel Track ({windowCoverings?.patioDoorsQty} × ${patioDoorPrice.toFixed(2)})
                  </span>
                  <span className="font-medium">${windowPatioSubtotal.toFixed(2)}</span>
                </div>
              )}
              {(windowCoverings?.automatedWindowsQty || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Somfy Automation ({windowCoverings?.automatedWindowsQty} × ${automatedMotorPrice.toFixed(2)})
                  </span>
                  <span className="font-medium">${windowAutomationSubtotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Flooring & Tile Upgrades Section */}
        {hasFlooringUpgrades && (
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
        {hasHeatedFloors && (
          <div>
            <h5 className="text-sm font-medium text-foreground mb-2">Heated Floors</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Heated Tile Floor ({heatedFloorAreas.length} area{heatedFloorAreas.length > 1 ? 's' : ''} × ${heatedFloorPerBathroom.toLocaleString()})
                </span>
                <span className="font-medium">${heatedFloorSubtotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Grand Totals */}
        <div className="border-t border-border pt-3 mt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal (pre-GST)</span>
            <span>${grandSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GST (5%)</span>
            <span>${grandGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between font-semibold text-foreground pt-2 text-lg">
            <span>Grand Total (incl. GST)</span>
            <span className="text-primary">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          * A 10% material overage is allowed on all quoted amounts.
        </p>

        {/* Comments Section */}
        {onUpgradeCommentsChange && (
          <div className="mt-4 pt-4 border-t border-border">
            <label htmlFor="upgrade-comments" className="block text-sm font-medium text-foreground mb-2">
              Additional Comments or Questions
            </label>
            <textarea
              id="upgrade-comments"
              value={upgradeComments}
              onChange={(e) => onUpgradeCommentsChange(e.target.value)}
              placeholder="Any specific questions or notes about your upgrade selections..."
              className="w-full min-h-[80px] p-3 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
            />
          </div>
        )}
      </div>
    </div>
  );
}
