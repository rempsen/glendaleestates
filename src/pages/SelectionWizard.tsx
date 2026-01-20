import { useState, useEffect, useCallback } from 'react';
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
import tileStackedImg from '@/assets/tile-stacked.jpg';
import tileBrickedImg from '@/assets/tile-bricked.jpg';
import tileHorizontalImg from '@/assets/tile-horizontal.jpg';
import { ArrowLeft, ArrowRight, Check, Home, Send, Info, Building2, MapPin, Download, LogOut, Palette, Play, ExternalLink, Save, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { User } from '@supabase/supabase-js';
import panelTrackBlindsImg from '@/assets/panel-track-blinds.png';
import somfyMotorsImg from '@/assets/somfy-motors.png';
import somfyControlsImg from '@/assets/somfy-controls.png';
import bedroomCarpetPreviewImg from '@/assets/bedroom-carpet-preview.jpg';
import bedroomLvpPreviewImg from '@/assets/bedroom-lvp-preview.jpg';

// Dynamic step configuration based on unit
const getSteps = (hasStairs: boolean) => {
  const baseSteps = ['Home Info', 'Floor Plan', 'Flooring', 'Bathroom', 'Backsplash', 'Bedrooms'];
  if (hasStairs) {
    return [...baseSteps, 'Stair Carpet', 'Windows', 'Upgrades', 'Comments', 'Review'];
  }
  return [...baseSteps, 'Windows', 'Upgrades', 'Comments', 'Review'];
};

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
  bedroomFlooringChoice: 'carpet' | 'lvp' | '';
  bedroomCarpetColour: string;
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
  } = useDynamicPricing();
  
  // Get dynamic pricing values
  const additionalWindowPrice = getAdditionalWindowPrice();
  const patioDoorPrice = getPatioDoorPrice();
  const automatedMotorPrice = getAutomatedMotorPrice();
  const heatedFloorPrice = getHeatedFloorPrice();
  
  const [selections, setSelections] = useState<SelectionState>({
    unitNumber: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    estimatedPossessionDate: '',
    hasStairs: true,
    lvpColour: '',
    lvpComments: '',
    spcTileColour: '',
    spcTileComments: '',
    backsplashOrientation: '',
    stairCarpetColour: '',
    bedroomFlooringChoice: '',
    bedroomCarpetColour: '',
    bedroomLvpColour: '',
    bedroomLvpSameAsMain: true,
    additionalWindowsQty: 0,
    patioDoorsQty: 0,
    automatedWindowsQty: 0,
    windowComments: '',
    salesComments: '',
    upgradeInterests: {
      automation: false,
    },
    upgradeInterestsNotes: '',
    areaUpgrades: [],
    upgradeFloorSelection: null,
    backsplashGrout: { enabled: false, groutColor: '', comments: '' },
    upgradeComments: '',
    bathroomTileSelected: false,
    heatedFloorBathrooms: 0,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{
    currentStep: number;
    highestStepReached: number;
    selections: Record<string, unknown>;
  } | null>(null);

  const steps = getSteps(selections.hasStairs);

  // Draft save hook
  const { saveDraft, loadDraft, deleteDraft, isSaving, lastSaved } = useDraftSave({
    userId: user?.id,
    unitNumber: selections.unitNumber,
    currentStep,
    highestStepReached,
    selections: selections as unknown as Record<string, unknown>,
  });

  // Check authentication on mount
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate('/buyer-auth');
      } else if (session.user?.email && !selections.email) {
        // Auto-populate email from authenticated user
        setSelections(prev => ({ ...prev, email: session.user.email || '' }));
      }
      setIsCheckingAuth(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        navigate('/buyer-auth');
      } else if (session.user?.email && !selections.email) {
        // Auto-populate email from authenticated user
        setSelections(prev => ({ ...prev, email: session.user.email || '' }));
      }
      setIsCheckingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Load existing draft when user and unit are set
  const checkForDraft = useCallback(async () => {
    if (!user?.id || !selections.unitNumber) return;
    
    const draft = await loadDraft();
    if (draft && draft.highestStepReached > 0) {
      setPendingDraft(draft);
      setShowDraftPrompt(true);
    }
  }, [user?.id, selections.unitNumber, loadDraft]);

  // Check for draft when unit number is entered
  useEffect(() => {
    if (selections.unitNumber && user?.id && currentStep === 0) {
      checkForDraft();
    }
  }, [selections.unitNumber, user?.id, checkForDraft, currentStep]);

  const resumeDraft = useCallback(() => {
    if (pendingDraft) {
      setSelections(pendingDraft.selections as unknown as SelectionState);
      setCurrentStep(pendingDraft.currentStep);
      setHighestStepReached(pendingDraft.highestStepReached);
      toast.success('Draft restored');
    }
    setShowDraftPrompt(false);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(() => {
    deleteDraft();
    setShowDraftPrompt(false);
    setPendingDraft(null);
    toast.info('Starting fresh');
  }, [deleteDraft]);

  // Auto-detect unit info when unit number changes
  useEffect(() => {
    const info = getUnitInfo(selections.unitNumber);
    setUnitInfo(info);
    if (info) {
      updateSelection('hasStairs', info.hasStairs);
    }
  }, [selections.unitNumber]);

  const handleSignOut = async () => {
    // Save draft before signing out
    await saveDraft(false);
    await supabase.auth.signOut();
    navigate('/');
  };

  const updateSelection = (key: keyof SelectionState, value: any) => {
    setSelections(prev => ({ ...prev, [key]: value }));
  };

  const toggleUpgradeInterest = (id: string) => {
    setSelections(prev => ({
      ...prev,
      upgradeInterests: {
        ...prev.upgradeInterests,
        [id]: !prev.upgradeInterests[id]
      }
    }));
  };


  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      setHighestStepReached(prev => Math.max(prev, newStep));
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const windowSubtotal = (selections.additionalWindowsQty * additionalWindowPrice) + (selections.patioDoorsQty * patioDoorPrice) + (selections.automatedWindowsQty * automatedMotorPrice);
      const windowTotal = windowSubtotal * (1 + gstRate);
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-selections-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          ...selections,
          unitType: unitInfo?.unitType || null,
          bedroomLvpColour: selections.bedroomLvpSameAsMain ? selections.lvpColour : selections.bedroomLvpColour,
          windowTotal: windowTotal,
          // Include new upgrade data
          areaUpgrades: selections.areaUpgrades,
          upgradeFloorSelection: selections.upgradeFloorSelection,
          backsplashGroutEnabled: selections.backsplashGrout.enabled,
          backsplashGroutColor: selections.backsplashGrout.groutColor,
          backsplashGroutComments: selections.backsplashGrout.comments,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Delete draft on successful submission
      await deleteDraft();
      
      toast.success('Selections submitted successfully!', {
        description: 'Your selections have been saved and emailed to our team.',
      });
      navigate('/');
    } catch (error) {
      console.error('Error submitting selections:', error);
      toast.error('Failed to submit selections', {
        description: 'Please try again or contact support.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function for Window Coverings step (enhanced with product showcase)
  const renderWindowCoveringsStep = () => (
    <StepContainer
      title="Window Coverings"
      subtitle="Your unit includes premium roller shades in all bedrooms"
      badge="Standard + Optional"
    >
      <div className="space-y-8">
        {/* Standard Confirmation - FIRST */}
        <div className="p-4 rounded-xl bg-success/10 border border-success/30">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-success mt-0.5" />
            <div>
              <p className="font-medium text-foreground">{windowCoveringProduct.name} — Included in All Bedrooms</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {windowCoveringProduct.features.map(f => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Hero Product Showcase - Panel Track Blinds */}
        <div className="rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-card to-secondary/30">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Product Image */}
            <div className="relative aspect-[4/3] md:aspect-auto overflow-hidden">
              <img 
                src={panelTrackBlindsImg} 
                alt="Sliding Panel Track Blinds for Patio Doors"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <span className="inline-block px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                  Perfect for Patio Doors
                </span>
              </div>
            </div>
            
            {/* Product Details */}
            <div className="p-6 md:p-8 flex flex-col justify-center">
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Sliding Panel Track Blinds
              </h3>
              <p className="text-muted-foreground mb-4">
                Elegant, modern coverage for your patio doors that matches all your bedroom roller shades. 
              </p>
              
              <ul className="space-y-2 mb-6">
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  <span>Same fabric as bedroom roller shades — coordinated look</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  <span>Panels slide smoothly on an overhead track</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  <span>Stack on either side or split in the middle</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                  <span>Light filtering option for privacy and natural light</span>
                </li>
              </ul>

              <div className="flex items-center gap-3 mb-4">
                <div className="text-2xl font-bold text-primary">$2,347.80</div>
                <div className="text-sm text-muted-foreground">per patio door<br />(plus GST, installed)</div>
              </div>

              <a 
                href="https://youtu.be/CKFOn8KJCzY" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Play className="w-4 h-4" />
                Watch Product Video
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Motorized Automation Showcase */}
        <div className="rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-card to-accent/20">
          {/* Main Hero Image */}
          <div className="relative">
            <img 
              src={somfyMotorsImg} 
              alt="Somfy Market-Leading Motors & Controls"
              className="w-full h-auto object-cover"
            />
          </div>
          
          {/* Product Details */}
          <div className="p-6 md:p-8">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Powered Automated Window Coverings
            </h3>
            <p className="text-muted-foreground mb-4">
              Upgrade any window shade to motorized operation with Somfy smart home integration.
            </p>
            
            <ul className="space-y-2 mb-6">
              <li className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>Control shades from your smartphone or voice assistant</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>Ultra-powerful and ultra-quiet motor technology</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>Includes motor, hub, programming & professional installation</span>
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                <span>Schedule shades to open and close automatically</span>
              </li>
            </ul>

            <div className="flex items-center gap-3 mb-6">
              <div className="text-2xl font-bold text-primary">$495.00</div>
              <div className="text-sm text-muted-foreground">per window<br />(plus GST, installed)</div>
            </div>

            {/* Controls Image */}
            <div className="mb-6 rounded-xl overflow-hidden border border-border">
              <img 
                src={somfyControlsImg} 
                alt="Somfy Control Options - TaHoma, Ysia, and Situo remotes"
                className="w-full h-auto object-cover"
              />
            </div>

            <a 
              href="https://www.somfysystems.com/en-us/products/shades-blinds-curtains/motorized-blinds-shades" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Learn More About Somfy
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Optional Extensions */}
        <div className="p-6 rounded-xl border border-border bg-card">
          <h3 className="font-medium text-foreground mb-2">How Many Would You Like?</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Select the number of windows and patio doors you'd like to add matching coverings to.
          </p>

          <div className="space-y-6">
            <div>
              <Label htmlFor="additionalWindows" className="text-foreground">
                Additional Non-Bedroom Windows
              </Label>
              <p className="text-sm text-muted-foreground mb-2">
                Living room, dining room, kitchen, etc. — ${additionalWindowPrice.toFixed(2)} per window (pre-GST, installed)
              </p>
              <Input
                id="additionalWindows"
                type="number"
                min={0}
                max={20}
                value={selections.additionalWindowsQty}
                onChange={(e) => updateSelection('additionalWindowsQty', parseInt(e.target.value) || 0)}
                className="max-w-24"
              />
            </div>

            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <Label htmlFor="patioDoors" className="text-foreground font-medium">
                Patio Door Panel Track Systems
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Sliding panel track for patio doors — ${patioDoorPrice.toFixed(2)} per opening (pre-GST, installed)
              </p>
              <Input
                id="patioDoors"
                type="number"
                min={0}
                max={5}
                value={selections.patioDoorsQty}
                onChange={(e) => updateSelection('patioDoorsQty', parseInt(e.target.value) || 0)}
                className="max-w-24"
              />
            </div>

            <div className="p-4 rounded-xl bg-accent/10 border border-accent/30">
              <Label htmlFor="automatedWindows" className="text-foreground font-medium">
                Motorized Automation Upgrade
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Add Somfy motorization to any window — ${automatedMotorPrice.toFixed(2)} per window (pre-GST, installed)
              </p>
              <Input
                id="automatedWindows"
                type="number"
                min={0}
                max={20}
                value={selections.automatedWindowsQty}
                onChange={(e) => updateSelection('automatedWindowsQty', parseInt(e.target.value) || 0)}
                className="max-w-24"
              />
            </div>
          </div>

          <div className="mt-6">
            {(selections.additionalWindowsQty > 0 || selections.patioDoorsQty > 0 || selections.automatedWindowsQty > 0) && (
              <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                <h4 className="font-medium text-foreground mb-3">Window Covering Pricing</h4>
                <div className="space-y-2 text-sm">
                  {selections.additionalWindowsQty > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Additional Windows ({selections.additionalWindowsQty} × ${additionalWindowPrice.toFixed(2)})
                      </span>
                      <span className="font-medium">${(selections.additionalWindowsQty * additionalWindowPrice).toLocaleString()}</span>
                    </div>
                  )}
                  {selections.patioDoorsQty > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Patio Door Panels ({selections.patioDoorsQty} × ${patioDoorPrice.toFixed(2)})
                      </span>
                      <span className="font-medium">${(selections.patioDoorsQty * patioDoorPrice).toLocaleString()}</span>
                    </div>
                  )}
                  {selections.automatedWindowsQty > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Motorized Automation ({selections.automatedWindowsQty} × ${automatedMotorPrice.toFixed(2)})
                      </span>
                      <span className="font-medium">${(selections.automatedWindowsQty * automatedMotorPrice).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 mt-2">
                    {(() => {
                      const subtotal = (selections.additionalWindowsQty * additionalWindowPrice) + 
                                       (selections.patioDoorsQty * patioDoorPrice) + 
                                       (selections.automatedWindowsQty * automatedMotorPrice);
                      const windowGst = subtotal * gstRate;
                      const total = subtotal + windowGst;
                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>${subtotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">GST ({(gstRate * 100).toFixed(0)}%)</span>
                            <span>${windowGst.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-foreground pt-1">
                            <span>Total</span>
                            <span className="text-primary">${total.toLocaleString()}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comments Section */}
        <div className="pt-4 border-t border-border">
          <Label htmlFor="windowComments" className="text-foreground">Notes or Comments</Label>
          <p className="text-sm text-muted-foreground mb-2">
            Add any special requests or notes about your window covering selection
          </p>
          <textarea
            id="windowComments"
            rows={3}
            placeholder="Optional notes about your window covering preferences..."
            value={selections.windowComments}
            onChange={(e) => updateSelection('windowComments', e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </StepContainer>
  );

  // Helper function for Upgrades step
  const renderUpgradesStep = () => (
    <StepContainer
      title="Premium Upgrades"
      subtitle="Select room-by-room flooring and tile upgrades for your home"
      badge="Optional"
    >
      <div className="space-y-8">
        {/* Room-based Flooring & Tile Upgrades */}
        <div>
          <h3 className="text-lg font-medium text-foreground mb-2">Select Areas to Upgrade</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click on a room to select upgrade materials. Pricing is calculated based on your unit's square footage.
          </p>
          <RoomUpgradePicker
            unitTypeCode={unitInfo?.typeCode || null}
            selectedFloor={selections.upgradeFloorSelection}
            selections={selections.areaUpgrades}
            onSelectionsChange={(newSelections) => updateSelection('areaUpgrades', newSelections)}
            onFloorChange={(floor) => updateSelection('upgradeFloorSelection', floor)}
          />
        </div>

        {/* Heated Floor Option - Only shown when bathroom/tile areas are selected */}
        {selections.areaUpgrades.some(s => ['guestBathroom', 'masterEnsuite'].includes(s.areaId) && s.materialType === 'tile') && (
          <div className="p-5 rounded-xl border-2 border-border bg-card">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-accent/10">
                <span className="text-accent text-xl">🔥</span>
              </div>
              <div>
                <h4 className="font-serif text-lg font-medium text-foreground">
                  Add Heated Tile Floors
                </h4>
                <p className="text-sm text-muted-foreground">
                  Add radiant floor heating to your upgraded porcelain tile bathrooms
                </p>
              </div>
            </div>

            {/* Karma Permission Warning */}
            <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30">
              <div className="flex items-start gap-2">
                <span className="text-warning mt-0.5 flex-shrink-0">⚠️</span>
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
                  onClick={() => {
                    if (selections.heatedFloorBathrooms > 0) {
                      updateSelection('heatedFloorBathrooms', selections.heatedFloorBathrooms - 1);
                    }
                  }}
                  className="w-8 h-8 rounded-lg border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
                  disabled={selections.heatedFloorBathrooms === 0}
                >
                  -
                </button>
                <span className="w-8 text-center font-medium">{selections.heatedFloorBathrooms}</span>
                <button
                  type="button"
                  onClick={() => {
                    const maxBathrooms = unitInfo?.bathrooms ? parseFloat(unitInfo.bathrooms) : 2;
                    if (selections.heatedFloorBathrooms < maxBathrooms) {
                      updateSelection('heatedFloorBathrooms', selections.heatedFloorBathrooms + 1);
                    }
                  }}
                  className="w-8 h-8 rounded-lg border border-border bg-background flex items-center justify-center hover:bg-muted transition-colors"
                  disabled={selections.heatedFloorBathrooms >= (unitInfo?.bathrooms ? parseFloat(unitInfo.bathrooms) : 2)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-foreground">
                ${heatedFloorPrice.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                per bathroom + GST
              </span>
            </div>

            {selections.heatedFloorBathrooms > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {selections.heatedFloorBathrooms} bathroom{selections.heatedFloorBathrooms > 1 ? 's' : ''} × ${heatedFloorPrice.toLocaleString()}
                  </span>
                  <span className="font-medium">
                    ${(selections.heatedFloorBathrooms * heatedFloorPrice).toLocaleString()} + GST
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pricing Summary */}
        <UpgradePricingSummary
          unitTypeCode={unitInfo?.typeCode || null}
          selectedFloor={selections.upgradeFloorSelection}
          areaUpgrades={selections.areaUpgrades}
          heatedFloorBathrooms={selections.heatedFloorBathrooms}
          bathroomTileSelected={selections.areaUpgrades.some(s => ['guestBathroom', 'masterEnsuite'].includes(s.areaId))}
          backsplashGrout={selections.backsplashGrout}
          upgradeComments={selections.upgradeComments}
          onUpgradeCommentsChange={(comments) => updateSelection('upgradeComments', comments)}
        />

        {/* Other Upgrade Interests */}
        <div>
          <h3 className="text-lg font-medium text-foreground mb-4">Express Interest in Other Upgrades</h3>
          <UpgradeTeaser
            selectedInterests={selections.upgradeInterests}
            onToggleInterest={toggleUpgradeInterest}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Mark any that interest you and our team will reach out with details and pricing.
          </p>
          
          {/* Text entry box for upgrade interests */}
          <div className="mt-4">
            <label htmlFor="upgrade-interests-notes" className="block text-sm font-medium text-foreground mb-2">
              Describe Your Upgrade Interests
            </label>
            <textarea
              id="upgrade-interests-notes"
              value={selections.upgradeInterestsNotes || ''}
              onChange={(e) => updateSelection('upgradeInterestsNotes', e.target.value)}
              placeholder="Please describe any specific upgrades you're interested in, special requests, or questions you have for our team..."
              className="w-full min-h-[100px] p-3 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
            />
          </div>
        </div>
      </div>
    </StepContainer>
  );

  // Helper function for Comments step
  const renderCommentsStep = () => (
    <StepContainer
      title="Sales Comments"
      subtitle="For office use — add any notes or comments about this selection meeting"
      badge="Internal"
    >
      <div className="space-y-6 max-w-2xl">
        <div className="p-5 rounded-xl bg-secondary/50 border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Info className="w-5 h-5 text-primary" />
            <span className="font-medium text-foreground">Meeting Notes</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Use this section to record any additional notes, special requests, or details discussed during the selection meeting that should be noted in the record.
          </p>
          <textarea
            id="salesComments"
            rows={6}
            placeholder="Enter any notes or comments for the office staff to review..."
            value={selections.salesComments}
            onChange={(e) => updateSelection('salesComments', e.target.value)}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>
    </StepContainer>
  );

  // Helper function for Review step
  const renderReviewStep = () => (
    <StepContainer
      title="Review Your Selections"
      subtitle="Please confirm everything looks correct before submitting"
      badge="Final Step"
    >
      <div className="space-y-6">
        {/* Home Info */}
        <div className="p-4 rounded-xl border border-border bg-card">
          <h4 className="font-medium text-foreground mb-3">Home Information</h4>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Number</span>
              <span className="font-medium">{selections.unitNumber || 'Not provided'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer</span>
              <span className="font-medium">
                {selections.firstName || selections.lastName 
                  ? `${selections.firstName} ${selections.lastName}`.trim() 
                  : 'Not provided'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{selections.phoneNumber || 'Not provided'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{selections.email || 'Not provided'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Possession Date</span>
              <span className="font-medium">
                {selections.estimatedPossessionDate 
                  ? new Date(selections.estimatedPossessionDate).toLocaleDateString() 
                  : 'Not provided'}
              </span>
            </div>
          </div>
        </div>

        {/* Flooring */}
        <div className="p-4 rounded-xl border border-border bg-card">
          <h4 className="font-medium text-foreground mb-3">Flooring Selections</h4>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Main Floor LVP</span>
              <span className="font-medium">
                {lvpOptions.find(o => o.id === selections.lvpColour)?.name || 'Not selected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bathroom/Laundry SPC</span>
              <span className="font-medium">
                {spcTileOptions.find(o => o.id === selections.spcTileColour)?.name || 'Not selected'}
              </span>
            </div>
            {selections.hasStairs && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stairs Carpet</span>
                <span className="font-medium">
                  {carpetOptions.find(o => o.id === selections.stairCarpetColour)?.name || 'Not selected'}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bedroom Flooring</span>
              <span className="font-medium capitalize">
                {selections.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : selections.bedroomFlooringChoice || 'Not selected'}
              </span>
            </div>
            {selections.bedroomFlooringChoice === 'carpet' && selections.bedroomCarpetColour && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bedroom Carpet Colour</span>
                <span className="font-medium">
                  {carpetOptions.find(o => o.id === selections.bedroomCarpetColour)?.name}
                </span>
              </div>
            )}
            {selections.bedroomFlooringChoice === 'lvp' && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bedroom LVP Colour</span>
                <span className="font-medium">
                  {selections.bedroomLvpSameAsMain
                    ? `${lvpOptions.find(o => o.id === selections.lvpColour)?.name || 'Not selected'} (Same as Main Floor)`
                    : lvpOptions.find(o => o.id === selections.bedroomLvpColour)?.name || 'Not selected'
                  }
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Backsplash */}
        <div className="p-4 rounded-xl border border-border bg-card">
          <h4 className="font-medium text-foreground mb-3">Kitchen Backsplash</h4>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tile</span>
              <span className="font-medium">{backsplashProduct.name} ({backsplashProduct.size})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Orientation</span>
              <span className="font-medium capitalize">{selections.backsplashOrientation || 'Not selected'}</span>
            </div>
            {selections.backsplashGrout?.enabled && (
              <>
                <div className="flex justify-between pt-2 border-t border-border mt-2">
                  <span className="text-muted-foreground">Grout Color Change</span>
                  <span className="font-medium text-primary">$300.00 + GST</span>
                </div>
                {selections.backsplashGrout.groutColor && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Color</span>
                    <span className="font-medium">{selections.backsplashGrout.groutColor}</span>
                  </div>
                )}
                {selections.backsplashGrout.comments && (
                  <div className="pt-1">
                    <span className="text-muted-foreground">Comments: </span>
                    <span className="text-foreground">{selections.backsplashGrout.comments}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Window Coverings */}
        {(selections.additionalWindowsQty > 0 || selections.patioDoorsQty > 0 || selections.automatedWindowsQty > 0) && (
          <div className="p-4 rounded-xl border border-border bg-card">
            <h4 className="font-medium text-foreground mb-3">Window Coverings</h4>
            <div className="grid gap-2 text-sm">
              {selections.additionalWindowsQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Additional Windows</span>
                  <span className="font-medium">
                    {selections.additionalWindowsQty} × ${additionalWindowPrice.toFixed(2)} = ${(selections.additionalWindowsQty * additionalWindowPrice).toFixed(2)}
                  </span>
                </div>
              )}
              {selections.patioDoorsQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patio Door Panel Track</span>
                  <span className="font-medium">
                    {selections.patioDoorsQty} × ${patioDoorPrice.toFixed(2)} = ${(selections.patioDoorsQty * patioDoorPrice).toFixed(2)}
                  </span>
                </div>
              )}
              {selections.automatedWindowsQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Somfy Automation</span>
                  <span className="font-medium">
                    {selections.automatedWindowsQty} × ${automatedMotorPrice.toFixed(2)} = ${(selections.automatedWindowsQty * automatedMotorPrice).toFixed(2)}
                  </span>
                </div>
              )}
              {(() => {
                const reviewSubtotal = (selections.additionalWindowsQty * additionalWindowPrice) + 
                                       (selections.patioDoorsQty * patioDoorPrice) + 
                                       (selections.automatedWindowsQty * automatedMotorPrice);
                const reviewGst = reviewSubtotal * gstRate;
                const reviewTotal = reviewSubtotal + reviewGst;
                return (
                  <>
                    <div className="flex justify-between pt-2 border-t border-border mt-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">${reviewSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST ({(gstRate * 100).toFixed(0)}%)</span>
                      <span className="font-medium">${reviewGst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-foreground">Total</span>
                      <span className="text-primary">${reviewTotal.toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
              {selections.windowComments && (
                <div className="pt-2 border-t border-border mt-2">
                  <span className="text-muted-foreground">Comments: </span>
                  <span className="text-foreground">{selections.windowComments}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing Summary */}
        {(selections.areaUpgrades.length > 0 || selections.heatedFloorBathrooms > 0) && (
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
            <UpgradePricingSummary
              unitTypeCode={unitInfo?.typeCode || null}
              selectedFloor={selections.upgradeFloorSelection}
              areaUpgrades={selections.areaUpgrades}
              heatedFloorBathrooms={selections.heatedFloorBathrooms}
              bathroomTileSelected={selections.areaUpgrades.some(s => ['guestBathroom', 'masterEnsuite'].includes(s.areaId))}
            />
          </div>
        )}

        {/* Upgrade Interests */}
        {Object.values(selections.upgradeInterests).some(v => v) && (
          <div className="p-4 rounded-xl border border-border bg-card">
            <h4 className="font-medium text-foreground mb-3">Upgrade Interests</h4>
            <p className="text-xs text-muted-foreground mb-2">Our team will contact you about:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(selections.upgradeInterests)
                .filter(([_, v]) => v)
                .map(([key]) => (
                  <span key={key} className="px-2 py-1 text-xs rounded-full bg-accent/20 text-accent capitalize">
                    {key.replace('-', ' ')}
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* Download PDF Button */}
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-foreground">Download Selection Summary</h4>
              <p className="text-sm text-muted-foreground">Save a PDF copy of your selections for your records</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const pricingConfig = { markupPercentage, gstRate, getMaterialCost, getGroutColorFee };
                  await generateBuyerPreviewPDF(selections, unitInfo?.typeCode || null, pricingConfig);
                  toast.success('PDF downloaded successfully!');
                } catch (error) {
                  console.error('Error generating PDF:', error);
                  toast.error('Failed to generate PDF');
                }
              }}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>

        {/* Note */}
        <div className="p-4 rounded-xl bg-muted/50">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Final pricing and payment will be handled later. 
            By submitting, you're confirming your selections for our team to review.
          </p>
        </div>
      </div>
    </StepContainer>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Home Info
        return (
          <StepContainer
            title="Your Home Information"
            subtitle="Please enter your details to get started"
            badge="Step 1 of 9"
          >
            <div className="space-y-6 max-w-lg">
              <div className="p-5 rounded-xl bg-secondary/50 border border-border">
                <div className="flex items-center gap-3 mb-5">
                  <Home className="w-5 h-5 text-primary" />
                  <span className="font-medium">Home & Buyer Details</span>
                </div>
                <div className="grid gap-5">
                  <div>
                    <Label htmlFor="unitNumber" className="text-foreground">Unit Number</Label>
                    <Input
                      id="unitNumber"
                      placeholder="e.g., Lot 042 or Unit 12A"
                      value={selections.unitNumber}
                      onChange={(e) => updateSelection('unitNumber', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="text-foreground">First Name</Label>
                      <Input
                        id="firstName"
                        placeholder="First name"
                        value={selections.firstName}
                        onChange={(e) => updateSelection('firstName', e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-foreground">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Last name"
                        value={selections.lastName}
                        onChange={(e) => updateSelection('lastName', e.target.value)}
                        className="mt-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="phoneNumber" className="text-foreground">Phone Number</Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      placeholder="(403) 555-1234"
                      value={selections.phoneNumber}
                      onChange={(e) => updateSelection('phoneNumber', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-foreground">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={selections.email}
                      onChange={(e) => updateSelection('email', e.target.value)}
                      className="mt-1.5"
                    />
                    {user?.email && selections.email === user.email && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Auto-filled from your account. You can edit if needed.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="possessionDate" className="text-foreground">Estimated Possession Date</Label>
                    <Input
                      id="possessionDate"
                      type="date"
                      value={selections.estimatedPossessionDate}
                      onChange={(e) => updateSelection('estimatedPossessionDate', e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>
              
              {unitInfo && (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Unit {unitInfo.unitNumber} — {unitInfo.unitType}</p>
                      <p className="text-sm text-muted-foreground">
                        {unitInfo.area} sq ft • {unitInfo.bedrooms} bed • {unitInfo.bathrooms} bath • {unitInfo.garage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Switch
                  id="hasStairs"
                  checked={selections.hasStairs}
                  onCheckedChange={(checked) => updateSelection('hasStairs', checked)}
                />
                <Label htmlFor="hasStairs" className="text-foreground cursor-pointer">
                  My home has stairs that require carpet
                </Label>
              </div>
            </div>
          </StepContainer>
        );

      case 1: // Floor Plan
        return (
          <StepContainer
            title="Your Floor Plan"
            subtitle={unitInfo ? `Review your ${unitInfo.unitType} layout and mark areas for material selections` : "Enter your unit number to view your floor plan"}
            badge="Interactive"
          >
            {unitInfo ? (
              <div className="space-y-4">
                {/* Unit Info Header */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/30">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-6 h-6 text-primary" />
                    <div>
                      <p className="font-semibold text-foreground">Unit {unitInfo.unitNumber} — {unitInfo.unitType}</p>
                      <p className="text-sm text-muted-foreground">
                        {unitInfo.area} sq ft • {unitInfo.bedrooms} bed • {unitInfo.bathrooms} bath
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={unitInfo.pdfPlanUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                      <Download className="w-4 h-4" />
                      Download PDF
                    </a>
                  </Button>
                </div>

                <div className="h-[500px] rounded-xl border border-border overflow-hidden">
                  <FloorPlanViewer unitInfo={unitInfo} />
                </div>
                {/* Instructions */}
                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <p><strong>Tip:</strong> Use Pan mode to navigate the floor plan. You can zoom in/out using the controls or scroll wheel.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Unit Selected</h3>
                <p className="text-muted-foreground mb-4">Please go back and enter your unit number to view your floor plan.</p>
                <Button variant="outline" onClick={prevStep}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              </div>
            )}
          </StepContainer>
        );

      case 2: // Main Floor LVP
        return (
          <StepContainer
            title="Main Floor Flooring"
            subtitle="Select your preferred Luxury Vinyl Plank colour — included at no additional cost"
            badge="Included"
          >
            <div className="space-y-6">
              {/* Product Specs */}
              <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">{lvpSpecs.productType}</p>
                  <p className="text-muted-foreground">
                    {lvpSpecs.length} × {lvpSpecs.width} • {lvpSpecs.thickness} thick • {lvpSpecs.wearLayer} wear layer • {lvpSpecs.surface} • {lvpSpecs.backing}
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                {lvpOptions.map(option => (
                  <SelectionCard
                    key={option.id}
                    id={option.id}
                    name={option.name}
                    description={option.description}
                    image={option.image}
                    selected={selections.lvpColour === option.id}
                    onSelect={(id) => updateSelection('lvpColour', id)}
                    variant="image"
                  />
                ))}
              </div>

              {/* Comments Section */}
              <div className="pt-4 border-t border-border">
                <Label htmlFor="lvpComments" className="text-foreground">Notes or Comments</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Add any special requests or notes about your flooring selection
                </p>
                <textarea
                  id="lvpComments"
                  rows={3}
                  placeholder="Optional notes..."
                  value={selections.lvpComments}
                  onChange={(e) => updateSelection('lvpComments', e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </StepContainer>
        );

      case 3: // Bathroom SPC Tile
        return (
          <StepContainer
            title="Bathroom & Laundry Flooring"
            subtitle="Select your preferred SPC Vinyl Tile colour — included at no additional cost"
            badge="Included"
          >
            <div className="space-y-6">
              {/* Product Specs */}
              <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">{spcTileSpecs.productType}</p>
                  <p className="text-muted-foreground">
                    {spcTileSpecs.size} • {spcTileSpecs.collection} Collection
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                {spcTileOptions.map(option => (
                  <SelectionCard
                    key={option.id}
                    id={option.id}
                    name={option.name}
                    description={option.description}
                    image={option.image}
                    selected={selections.spcTileColour === option.id}
                    onSelect={(id) => updateSelection('spcTileColour', id)}
                    variant="image"
                  />
                ))}
              </div>

              {/* Comments Section */}
              <div className="pt-4 border-t border-border">
                <Label htmlFor="spcTileComments" className="text-foreground">Notes or Comments</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Add any special requests or notes about your bathroom tile selection
                </p>
                <textarea
                  id="spcTileComments"
                  rows={3}
                  placeholder="Optional notes about your bathroom tile preferences..."
                  value={selections.spcTileComments}
                  onChange={(e) => updateSelection('spcTileComments', e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>
          </StepContainer>
        );

      case 4: // Backsplash
        const backsplashIllustrations: Record<string, string> = {
          stacked: tileStackedImg,
          bricked: tileBrickedImg,
          vertical: tileHorizontalImg,
        };
        
        const groutPrice = selections.backsplashGrout.enabled 
          ? calculateBacksplashGroutPrice() 
          : { markedUpCost: 0, gst: 0, total: 0 };
        
        return (
          <StepContainer
            title="Kitchen Backsplash"
            subtitle="Your backsplash includes beautiful white subway tile. Choose your preferred orientation."
            badge="Included"
          >
            <div className="space-y-6">
              {/* Product Info */}
              <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                <Info className="w-5 h-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">{backsplashProduct.name}</p>
                  <p className="text-muted-foreground">
                    {backsplashProduct.size} • {backsplashProduct.finish} finish • {backsplashProduct.collection}
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Check className="w-4 h-4 text-success" />
                This choice does not change your price.
              </p>

              <div className="grid sm:grid-cols-3 gap-4">
                {backsplashOrientations.map(option => (
                  <div
                    key={option.id}
                    onClick={() => updateSelection('backsplashOrientation', option.id)}
                    className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                      selections.backsplashOrientation === option.id
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="aspect-[4/3] overflow-hidden">
                      <img
                        src={backsplashIllustrations[option.id]}
                        alt={`${option.name} tile orientation`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-4 bg-card">
                      <div className="flex items-center gap-2">
                        {selections.backsplashOrientation === option.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                        <h4 className="font-medium text-foreground">{option.name}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Grout Color Change Option */}
              <div className="pt-6 border-t border-border">
                <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-primary" />
                  Change Grout Color
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Your backsplash comes with standard white grout. Want a different color? Add a custom grout color for $300 + GST.
                </p>
                
                <div className={`
                  p-4 rounded-xl border-2 transition-all
                  ${selections.backsplashGrout.enabled 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border bg-card hover:border-primary/50'
                  }
                `}>
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => updateSelection('backsplashGrout', {
                      ...selections.backsplashGrout,
                      enabled: !selections.backsplashGrout.enabled
                    })}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        p-2 rounded-lg
                        ${selections.backsplashGrout.enabled ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'}
                      `}>
                        <Palette className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-medium text-foreground text-sm">Change Backsplash Grout Color</h4>
                        <p className="text-xs text-muted-foreground">$300.00 + GST ($315.00 total)</p>
                      </div>
                    </div>
                    
                    <div className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center
                      ${selections.backsplashGrout.enabled ? 'border-primary bg-primary' : 'border-muted-foreground'}
                    `}>
                      {selections.backsplashGrout.enabled && (
                        <Check className="w-3 h-3 text-primary-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded form when enabled */}
                  {selections.backsplashGrout.enabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="mt-4 pt-4 border-t border-border space-y-4"
                    >
                      <div>
                        <Label className="text-sm">Grout Color</Label>
                        <Input
                          placeholder="e.g., Charcoal, Black, Light Gray..."
                          value={selections.backsplashGrout.groutColor}
                          onChange={(e) => updateSelection('backsplashGrout', {
                            ...selections.backsplashGrout,
                            groutColor: e.target.value
                          })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-sm">Comments / Notes</Label>
                        <Input
                          placeholder="Any special notes about the grout..."
                          value={selections.backsplashGrout.comments}
                          onChange={(e) => updateSelection('backsplashGrout', {
                            ...selections.backsplashGrout,
                            comments: e.target.value
                          })}
                          className="mt-1"
                        />
                      </div>
                      <div className="p-3 rounded-lg bg-secondary/50">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">
                            Grout Color Change
                          </span>
                          <span className="font-semibold text-primary">
                            ${groutPrice.total.toFixed(2)} (incl. GST)
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </StepContainer>
        );

      case 5: // Bedroom Flooring
        return (
          <StepContainer
            title="Bedroom Flooring"
            subtitle="Choose premium carpet or matching LVP for your bedrooms — included at no additional cost"
            badge="Included"
          >
            <div className="space-y-8">

              {/* Bedroom Flooring Choice */}
              <div>
                <h3 className="font-medium text-foreground mb-4">What type of flooring would you prefer?</h3>
                <p className="text-sm text-muted-foreground mb-6 flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  Choosing carpet or plank in bedrooms does not affect your price.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Carpet Option */}
                  <button
                    onClick={() => updateSelection('bedroomFlooringChoice', 'carpet')}
                    className={`
                      group relative overflow-hidden rounded-2xl border-2 transition-all duration-300
                      ${selections.bedroomFlooringChoice === 'carpet' 
                        ? 'border-primary ring-2 ring-primary/20 shadow-lg' 
                        : 'border-border hover:border-primary/50 hover:shadow-md'}
                    `}
                  >
                    <div className="aspect-[4/3] overflow-hidden">
                      <img 
                        src={bedroomCarpetPreviewImg} 
                        alt="Bedroom with carpet flooring" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
                      <h4 className="text-lg font-semibold text-white mb-1">Carpet</h4>
                      <p className="text-sm text-white/80">Soft and warm underfoot — cozy comfort for bedrooms</p>
                    </div>
                    {selections.bedroomFlooringChoice === 'carpet' && (
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-5 h-5 text-primary-foreground" />
                      </div>
                    )}
                  </button>

                  {/* LVP Option */}
                  <button
                    onClick={() => updateSelection('bedroomFlooringChoice', 'lvp')}
                    className={`
                      group relative overflow-hidden rounded-2xl border-2 transition-all duration-300
                      ${selections.bedroomFlooringChoice === 'lvp' 
                        ? 'border-primary ring-2 ring-primary/20 shadow-lg' 
                        : 'border-border hover:border-primary/50 hover:shadow-md'}
                    `}
                  >
                    <div className="aspect-[4/3] overflow-hidden">
                      <img 
                        src={bedroomLvpPreviewImg} 
                        alt="Bedroom with LVP flooring" 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 text-left">
                      <h4 className="text-lg font-semibold text-white mb-1">Luxury Vinyl Plank</h4>
                      <p className="text-sm text-white/80">Matching LVP from main floor — durable and easy to clean</p>
                    </div>
                    {selections.bedroomFlooringChoice === 'lvp' && (
                      <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-5 h-5 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Bedroom Carpet Color - show if carpet selected */}
              {selections.bedroomFlooringChoice === 'carpet' && (
                <div>
                  <h3 className="font-medium text-foreground mb-4">Bedroom Carpet Colour</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {carpetOptions.map(option => (
                      <SelectionCard
                        key={option.id}
                        id={option.id}
                        name={option.name}
                        image={option.image}
                        selected={selections.bedroomCarpetColour === option.id}
                        onSelect={(id) => updateSelection('bedroomCarpetColour', id)}
                        variant="image"
                      />
                    ))}
                  </div>
                </div>
              )}

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
          // Stair Carpet Step
          return (
            <StepContainer
              title="Stair Carpet"
              subtitle="Select your preferred carpet colour for your stairs — included at no additional cost"
              badge="Included"
            >
              <div className="space-y-6">
                <div className="p-3 rounded-lg bg-muted/50 mb-4 text-sm">
                  <p className="text-muted-foreground">{carpetSpecs.productType} — {carpetSpecs.features.join(' • ')}</p>
                </div>
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
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {user.email}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
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
    </div>
  );
}
