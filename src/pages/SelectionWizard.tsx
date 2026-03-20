import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { WizardProgress } from '@/components/WizardProgress';
import { StepContainer } from '@/components/StepContainer';
import { SelectionCard } from '@/components/SelectionCard';
import { UpgradeTeaser } from '@/components/UpgradeTeaser';
import { FloorPlanViewer } from '@/components/FloorPlanViewer';
import { RoomUpgradePicker } from '@/components/RoomUpgradePicker';
import { PremiumLVPShowcase } from '@/components/upgrades/PremiumLVPShowcase';
import { PremiumCarpetShowcase } from '@/components/upgrades/PremiumCarpetShowcase';
import { UpgradePricingSummary } from '@/components/UpgradePricingSummary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useDraftSave } from '@/hooks/useDraftSave';
import { 
  lvpOptions, 
  lvpSpecs,
  spcTileOptions, 
  spcTileSpecs,
  backsplashProduct,
  backsplashOrientations, 
  carpetOptions,
  carpetSpecs,
  windowCoveringProduct,
} from '@/lib/mockData';
import { getUnitInfo, UnitInfo } from '@/lib/unitData';
import { 
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  requiresFloorSelection,
  AREA_DEFINITIONS,
  UPGRADE_MATERIALS,
} from '@/lib/upgradeCostData';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { generateBuyerPreviewPDF } from '@/lib/buyerPdfGenerator';
import { SubmissionProgress, SubmissionStep } from '@/components/SubmissionProgress';
import tileStackedImg from '@/assets/tile-stacked.jpg';
import tileBrickedImg from '@/assets/tile-bricked.jpg';
import tileHorizontalImg from '@/assets/tile-horizontal.jpg';
import { ArrowLeft, ArrowRight, Check, Home, Send, Info, Building2, MapPin, Download, LogOut, Palette, Play, ExternalLink, Save, Clock, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { User } from '@supabase/supabase-js';
import panelTrackBlindsImg from '@/assets/panel-track-blinds.png';
import somfyMotorsImg from '@/assets/somfy-motors.png';
import somfyControlsImg from '@/assets/somfy-controls.png';
import bedroomCarpetPreviewImg from '@/assets/bedroom-carpet-preview.jpg';
import bedroomLvpPreviewImg from '@/assets/bedroom-lvp-preview.jpg';
import { DocumentUploader } from '@/components/DocumentUploader';

// Dynamic step configuration based on unit
const getSteps = (hasStairs: boolean) => {
  const baseSteps = ['Home Info', 'Floor Plan', 'Flooring', 'Bathroom', 'Backsplash', 'Bedrooms'];
  if (hasStairs) {
    return [...baseSteps, 'Stair Carpet', 'Windows', 'Upgrades', 'Comments', 'Review'];
  }
  return [...baseSteps, 'Windows', 'Upgrades', 'Comments', 'Review'];
};

// Document upload interface
interface UploadedDocument {
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface SelectionState {
  unitNumber: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  estimatedPossessionDate: string;
  hasStairs: boolean;
  lvpColour: string;
  lvpComments: string;
  spcTileColour: string;
  spcTileComments: string;
  backsplashOrientation: string;
  stairCarpetColour: string;
  stairLvpUpgradeSelected: boolean; // Deprecated - use stairUpgradeType instead
  stairUpgradeType: 'standard' | 'lvp' | 'premium_lvp'; // Stair upgrade option
  bedroomFlooringChoice: 'carpet' | 'lvp' | '';
  bedroomCarpetColour: string;
  premiumUnderpadBedroom: boolean;
  premiumUnderpadStairs: boolean;
  bedroomLvpColour: string;
  bedroomLvpSameAsMain: boolean;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  automatedWindowsQty: number;
  windowComments: string;
  salesComments: string;
  upgradeInterests: Record<string, boolean>;
  upgradeInterestsNotes: string; // Text notes for upgrade interests
  // Area-based upgrades (new system)
  areaUpgrades: AreaUpgradeSelection[];
  upgradeFloorSelection: '1' | '2' | null; // For G/H units
  backsplashGrout: BacksplashGroutSelection; // Backsplash grout color change
  upgradeComments: string; // Comments for upgrade pricing summary
  // Heated floors (kept separate)
  bathroomTileSelected: boolean;
  heatedFloorBathrooms: number;
  // Document uploads
  documentUploads: UploadedDocument[];
}

export default function SelectionWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [highestStepReached, setHighestStepReached] = useState(0);
  const [unitInfo, setUnitInfo] = useState<UnitInfo | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Use dynamic pricing from database
  const { 
    calculateTotalUpgradeCost, 
    calculateBacksplashGroutPrice, 
    markupPercentage, 
    gstRate, 
    getMaterialCost, 
    getGroutColorFee,
    getAdditionalWindowPrice,
    getPatioDoorPrice,
    getAutomatedMotorPrice,
    getHeatedFloorPrice,
    getStairLvpUpgradePrice,
    getStairPremiumLvpUpgradePrice,
    getGroutColorChangePrice,
    getUnderpadStairsPrice,
    getUnderpadCostPerSqyd,
    isFlatRateEnabled,
    getUnitAreaData,
  } = useDynamicPricing();
  
  // Get dynamic pricing values - use useMemo to ensure they update when pricing loads
  const additionalWindowPrice = useMemo(() => getAdditionalWindowPrice(), [getAdditionalWindowPrice]);
  const patioDoorPrice = useMemo(() => getPatioDoorPrice(), [getPatioDoorPrice]);
  const automatedMotorPrice = useMemo(() => getAutomatedMotorPrice(), [getAutomatedMotorPrice]);
  const heatedFloorPrice = useMemo(() => getHeatedFloorPrice(), [getHeatedFloorPrice]);
  const stairLvpUpgradePrice = useMemo(() => getStairLvpUpgradePrice(), [getStairLvpUpgradePrice]);
  const stairPremiumLvpUpgradePrice = useMemo(() => getStairPremiumLvpUpgradePrice(), [getStairPremiumLvpUpgradePrice]);
  const groutColorChangePrice = useMemo(() => getGroutColorChangePrice(), [getGroutColorChangePrice]);
  const underpadStairsPrice = useMemo(() => getUnderpadStairsPrice(), [getUnderpadStairsPrice]);
  const underpadCostPerSqyd = useMemo(() => getUnderpadCostPerSqyd(), [getUnderpadCostPerSqyd]);
  const isStairLvpUpgradeEnabled = useMemo(() => isFlatRateEnabled('stair_lvp_upgrade_price'), [isFlatRateEnabled]);
  const isStairPremiumLvpUpgradeEnabled = useMemo(() => isFlatRateEnabled('stair_premium_lvp_upgrade_price'), [isFlatRateEnabled]);
  const isUnderpadStairsEnabled = useMemo(() => isFlatRateEnabled('premium_underpad_stairs_price'), [isFlatRateEnabled]);
  const bedroomUnderpadUnitTypeCode = useMemo(() => {
    const code = unitInfo?.typeCode?.toUpperCase() || '';

    if (code === 'G' || code === 'H') {
      return `${code}-2`;
    }

    return code;
  }, [unitInfo?.typeCode]);

  const [selections, setSelections] = useState<SelectionState>({
...
              {/* Premium Underpad Upgrade - show if carpet selected */}
              {selections.bedroomFlooringChoice === 'carpet' && (() => {
                const unitData = getUnitAreaData(bedroomUnderpadUnitTypeCode);
                const carpetSqyd = unitData ? (unitData.secondBedroomCarpet + unitData.masterBedroom) : 0;
                const underpadBaseCost = carpetSqyd * underpadCostPerSqyd;
                const underpadMarkedUp = underpadBaseCost * (1 + markupPercentage);
                const underpadWithGst = underpadMarkedUp * (1 + gstRate);
                return carpetSqyd > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
                      selections.premiumUnderpadBedroom
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                    onClick={() => updateSelection('premiumUnderpadBedroom', !selections.premiumUnderpadBedroom)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selections.premiumUnderpadBedroom
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground'
                      }`}>
                        {selections.premiumUnderpadBedroom && <Check className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            Upgrade to Premium Underpad
                          </h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-accent/20 text-accent-foreground">
                            ${underpadMarkedUp.toFixed(2)} + GST
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-3">
                          Premium carpet underpad with a waterproof barrier on top to allow spills to be cleaned much more easily, constructed of dense memory foam for increased comfort underfoot.
                        </p>
                        <ul className="space-y-1 text-sm">
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Waterproof barrier for easy spill cleanup
                          </li>
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Dense memory foam for superior comfort
                          </li>
                        </ul>
                        {selections.premiumUnderpadBedroom && (
                          <div className="mt-4 pt-3 border-t border-border">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground font-medium">Total with GST:</span>
                              <span className="text-primary font-semibold text-lg">
                                ${underpadWithGst.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : null;
              })()}

              {/* Bedroom LVP Color - show if LVP selected */}
              {selections.bedroomFlooringChoice === 'lvp' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="p-5 rounded-xl border border-primary/30 bg-primary/5"
                >
                  <h3 className="font-medium text-foreground mb-3">Confirm Bedroom LVP Colour</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Select the LVP colour for your bedrooms. By default, it matches your main floor selection.
                  </p>
                  
                  {/* Same as main floor option */}
                  <div
                    onClick={() => updateSelection('bedroomLvpSameAsMain', true)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all mb-4 ${
                      selections.bedroomLvpSameAsMain
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selections.bedroomLvpSameAsMain ? 'border-primary' : 'border-muted-foreground'
                      }`}>
                        {selections.bedroomLvpSameAsMain && (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Same as Main Floor
                        </span>
                        {selections.lvpColour && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            — {lvpOptions.find(o => o.id === selections.lvpColour)?.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Different colour option */}
                  <div
                    onClick={() => updateSelection('bedroomLvpSameAsMain', false)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      !selections.bedroomLvpSameAsMain
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        !selections.bedroomLvpSameAsMain ? 'border-primary' : 'border-muted-foreground'
                      }`}>
                        {!selections.bedroomLvpSameAsMain && (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <span className="font-medium text-foreground">Choose a Different Colour</span>
                    </div>
                    
                    {!selections.bedroomLvpSameAsMain && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="grid grid-cols-3 gap-3 mt-4"
                      >
                        {lvpOptions.map(option => (
                          <div
                            key={option.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateSelection('bedroomLvpColour', option.id);
                            }}
                            className={`relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                              selections.bedroomLvpColour === option.id
                                ? 'border-primary ring-2 ring-primary/20'
                                : 'border-transparent hover:border-primary/50'
                            }`}
                          >
                            <div className="aspect-square overflow-hidden">
                              <img
                                src={option.image}
                                alt={option.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm p-2">
                              <p className="text-xs font-medium text-foreground text-center">{option.name}</p>
                            </div>
                            {selections.bedroomLvpColour === option.id && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </StepContainer>
        );

      case 6: // Stair Carpet (only for units with stairs) OR Window Coverings (for units without stairs)
        if (selections.hasStairs) {
          // Stair Flooring Step - Standard Carpet, LVP Upgrade, or Premium LVP Upgrade
          const handleStairSelection = (type: 'standard' | 'lvp' | 'premium_lvp') => {
            updateSelection('stairUpgradeType', type);
            updateSelection('stairLvpUpgradeSelected', type === 'lvp' || type === 'premium_lvp');
            // If selecting an upgrade, clear carpet selection
            if (type !== 'standard') {
              updateSelection('stairCarpetColour', '');
            }
          };

          return (
            <StepContainer
              title="Stair Flooring"
              subtitle="Choose standard carpet (included) or upgrade to LVP with custom nosings"
              badge={selections.stairUpgradeType !== 'standard' ? "Upgrade" : "Included"}
            >
              <div className="space-y-4">
                {/* Premium LVP Upgrade Option */}
                {isStairPremiumLvpUpgradeEnabled && (
                  <div className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
                    selections.stairUpgradeType === 'premium_lvp' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                  onClick={() => handleStairSelection('premium_lvp')}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selections.stairUpgradeType === 'premium_lvp' 
                          ? 'border-primary bg-primary text-primary-foreground' 
                          : 'border-muted-foreground'
                      }`}>
                        {selections.stairUpgradeType === 'premium_lvp' && <Check className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            Premium LVP with Custom Stair Nosings
                          </h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-accent/20 text-accent-foreground">
                            ${stairPremiumLvpUpgradePrice.toLocaleString()} + GST
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-3">
                          Our highest quality LVP upgrade with premium materials and custom-made flush stair nosings.
                        </p>
                        <ul className="space-y-1 text-sm">
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Premium grade LVP materials
                          </li>
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Custom-made flush stair nosings
                          </li>
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Enhanced durability and finish
                          </li>
                        </ul>
                        {selections.stairUpgradeType === 'premium_lvp' && (
                          <div className="mt-4 pt-3 border-t border-border">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground font-medium">Total with GST:</span>
                              <span className="text-primary font-semibold text-lg">
                                ${(stairPremiumLvpUpgradePrice * (1 + gstRate)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Standard LVP Upgrade Option */}
                {isStairLvpUpgradeEnabled && (
                  <div className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
                    selections.stairUpgradeType === 'lvp' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                  onClick={() => handleStairSelection('lvp')}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selections.stairUpgradeType === 'lvp' 
                          ? 'border-primary bg-primary text-primary-foreground' 
                          : 'border-muted-foreground'
                      }`}>
                        {selections.stairUpgradeType === 'lvp' && <Check className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            LVP with Custom Stair Nosings
                          </h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-accent/20 text-accent-foreground">
                            ${stairLvpUpgradePrice.toLocaleString()} + GST
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-3">
                          Match your stairs with the same LVP as your main floor, complete with custom-made flush stair nosings.
                        </p>
                        <ul className="space-y-1 text-sm">
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Matching LVP to main floor ({lvpOptions.find(o => o.id === selections.lvpColour)?.name || 'your selection'})
                          </li>
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Custom-made flush stair nosings
                          </li>
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Modern, seamless appearance
                          </li>
                        </ul>
                        {selections.stairUpgradeType === 'lvp' && (
                          <div className="mt-4 pt-3 border-t border-border">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground font-medium">Total with GST:</span>
                              <span className="text-primary font-semibold text-lg">
                                ${(stairLvpUpgradePrice * (1 + gstRate)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Standard Carpet Option */}
                <div 
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    selections.stairUpgradeType === 'standard' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border bg-card hover:border-primary/50'
                  }`}
                  onClick={() => handleStairSelection('standard')}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      selections.stairUpgradeType === 'standard' 
                        ? 'border-primary bg-primary text-primary-foreground' 
                        : 'border-muted-foreground'
                    }`}>
                      {selections.stairUpgradeType === 'standard' && <Check className="w-4 h-4" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Standard Carpet (Included)</h3>
                      <p className="text-sm text-muted-foreground">
                        {carpetSpecs.productType} — {carpetSpecs.features[0]}
                      </p>
                    </div>
                  </div>
                  
                  {selections.stairUpgradeType === 'standard' && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {carpetOptions.map(option => (
                        <SelectionCard
                          key={option.id}
                          id={option.id}
                          name={option.name}
                          image={option.image}
                          selected={selections.stairCarpetColour === option.id}
                          onSelect={(id) => updateSelection('stairCarpetColour', id)}
                          variant="image"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Premium Underpad for Stairs - show when carpet is selected (standard or premium) */}
                {(selections.stairUpgradeType === 'standard') && isUnderpadStairsEnabled && underpadStairsPrice > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
                      selections.premiumUnderpadStairs
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                    onClick={() => updateSelection('premiumUnderpadStairs', !selections.premiumUnderpadStairs)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selections.premiumUnderpadStairs
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground'
                      }`}>
                        {selections.premiumUnderpadStairs && <Check className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            Upgrade Stair Underpad
                          </h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-accent/20 text-accent-foreground">
                            ${underpadStairsPrice.toFixed(2)} + GST
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-3">
                          Premium underpad for your stairs with waterproof barrier and dense memory foam for extra comfort and durability.
                        </p>
                        {selections.premiumUnderpadStairs && (
                          <div className="mt-2 pt-3 border-t border-border">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground font-medium">Total with GST:</span>
                              <span className="text-primary font-semibold text-lg">
                                ${(underpadStairsPrice * (1 + gstRate)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </StepContainer>
          );
        }
        // Fall through to Window Coverings for units without stairs
        return renderWindowCoveringsStep();

      case 7: // Window Coverings (for units with stairs) OR Upgrades (for units without stairs)
        if (selections.hasStairs) {
          return renderWindowCoveringsStep();
        }
        // Fall through to Upgrades for units without stairs
        return renderUpgradesStep();

      case 8: // Upgrades (for units with stairs) OR Comments (for units without stairs)
        if (selections.hasStairs) {
          return renderUpgradesStep();
        }
        return renderCommentsStep();

      case 9: // Comments (for units with stairs) OR Review (for units without stairs)
        if (selections.hasStairs) {
          return renderCommentsStep();
        }
        return renderReviewStep();

      case 10: // Review (for units with stairs only)
        return renderReviewStep();
    }
  };

  // Show loading state while checking auth
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-2">
              {/* Save Draft Button */}
              {selections.unitNumber && currentStep > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => saveDraft(true)} 
                  disabled={isSaving}
                  className="gap-1"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Save Draft</span>
                </Button>
              )}
              {lastSaved && (
                <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Saved {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {user && (
                <span className="text-xs text-muted-foreground hidden lg:block">
                  {user.email}
                </span>
              )}
              {/* Save & Exit button */}
              {selections.unitNumber && currentStep > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSaveAndExit}
                  disabled={isSaving}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Save & Exit</span>
                </Button>
              )}
              {/* Regular Sign Out (only show if no unit yet) */}
              {(!selections.unitNumber || currentStep === 0) && (
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1">
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Draft Resume Prompt */}
      {showDraftPrompt && pendingDraft && (
        <div className="bg-primary/10 border-b border-primary/20">
          <div className="container max-w-5xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-sm">
                <Save className="w-4 h-4 text-primary" />
                <span className="text-foreground font-medium">You have a saved draft for this unit.</span>
                <span className="text-muted-foreground hidden sm:inline">
                  (Step {pendingDraft.highestStepReached + 1} of {steps.length})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={discardDraft}>
                  Start Fresh
                </Button>
                <Button size="sm" onClick={resumeDraft}>
                  Resume Draft
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="border-b border-border bg-card">
        <div className="container max-w-5xl mx-auto px-4">
          <WizardProgress
            steps={steps}
            currentStep={currentStep}
            onStepClick={setCurrentStep}
            allStepsVisited={highestStepReached >= steps.length - 1}
            hasUnsavedChanges={hasUnsavedChanges}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="container max-w-3xl mx-auto px-4 py-8 md:py-12">
        <AnimatePresence mode="wait">
          <motion.div key={currentStep}>
            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
          <Button
            variant="ghost"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button onClick={nextStep} className="gap-2">
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="hero" onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Selections
                </>
              )}
            </Button>
          )}
        </div>
      </main>
      
      {/* Submission Progress Overlay */}
      <SubmissionProgress currentStep={submissionStep} isVisible={isSubmitting} />
    </div>
  );
}
