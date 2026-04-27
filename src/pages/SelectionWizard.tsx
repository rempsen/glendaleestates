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
  MaterialType,
} from '@/lib/upgradeCostData';
import { useDynamicPricing } from '@/hooks/useDynamicPricing';
import { generateBuyerPreviewPDF } from '@/lib/buyerPdfGenerator';
import { SubmissionProgress, SubmissionStep } from '@/components/SubmissionProgress';
import tileStackedImg from '@/assets/tile-stacked.jpg';
import tileBrickedImg from '@/assets/tile-bricked.jpg';
import tileHorizontalImg from '@/assets/tile-horizontal.jpg';
import { ArrowLeft, ArrowRight, Check, Home, Send, Info, Building2, MapPin, Download, LogOut, Palette, Play, ExternalLink, Save, Clock, Paperclip, AlertCircle } from 'lucide-react';
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
  premiumCarpetBedroom: boolean;
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
  customTiledShower: boolean;
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
    stairLvpUpgradeSelected: false,
    stairUpgradeType: 'standard',
    bedroomFlooringChoice: '',
    bedroomCarpetColour: '',
    premiumCarpetBedroom: false,
    premiumUnderpadBedroom: false,
    premiumUnderpadStairs: false,
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
    customTiledShower: false,
    documentUploads: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep>('preparing');
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{
    currentStep: number;
    highestStepReached: number;
    selections: Record<string, unknown>;
  } | null>(null);

  const steps = getSteps(selections.hasStairs);

  // Draft save hook
  const { saveDraft, loadDraft, deleteDraft, isSaving, lastSaved, hasUnsavedChanges } = useDraftSave({
    userId: user?.id,
    unitNumber: selections.unitNumber,
    currentStep,
    highestStepReached,
    selections: selections as unknown as Record<string, unknown>,
  });

  // Save & Exit handler
  const handleSaveAndExit = async () => {
    await saveDraft(false);
    await supabase.auth.signOut();
    navigate('/draft-saved');
  };

  // Section 3 (LVP) and Section 4 (SPC Tile) comment-coverage warnings.
  // Detect when the buyer typed an area-upgrade comment that semantically belongs
  // to one of these sections but left the section's own Notes field blank — the
  // pattern that historically caused notes to be perceived as "missing".
  const LVP_RELATED_AREA_IDS = useMemo(
    () => new Set(['allLvp', 'mainLiving', 'secondBedroom', 'masterBedroom']),
    [],
  );
  const TILE_RELATED_AREA_IDS = useMemo(
    () => new Set(['guestBathroom', 'masterEnsuite', 'laundry']),
    [],
  );
  const lvpRelatedAreaComments = useMemo(
    () =>
      (selections.areaUpgrades || []).filter(
        (u) => u && u.comments && u.comments.trim() && LVP_RELATED_AREA_IDS.has(u.areaId),
      ),
    [selections.areaUpgrades, LVP_RELATED_AREA_IDS],
  );
  const tileRelatedAreaComments = useMemo(
    () =>
      (selections.areaUpgrades || []).filter(
        (u) => u && u.comments && u.comments.trim() && TILE_RELATED_AREA_IDS.has(u.areaId),
      ),
    [selections.areaUpgrades, TILE_RELATED_AREA_IDS],
  );
  const showLvpCommentWarning =
    !selections.lvpComments.trim() && lvpRelatedAreaComments.length > 0;
  const showTileCommentWarning =
    !selections.spcTileComments.trim() && tileRelatedAreaComments.length > 0;

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

  // Preload flooring images for Step 3 while user is on earlier steps
  useEffect(() => {
    // Preload all product images early: LVP, SPC tile, carpet, bedroom previews, backsplash
    const imagesToPreload = [
      ...lvpOptions.map(o => o.image),
      ...spcTileOptions.map(o => o.image),
      ...carpetOptions.map(o => o.image),
      // Stage 6 bedroom flooring preview images
      bedroomCarpetPreviewImg,
      bedroomLvpPreviewImg,
      // Backsplash illustrations
      tileStackedImg,
      tileBrickedImg,
      tileHorizontalImg,
    ];
    
    imagesToPreload.forEach(src => {
      if (src) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = src;
        document.head.appendChild(link);
      }
    });

    return () => {
      // Cleanup preload links on unmount
      document.querySelectorAll('link[rel="preload"][as="image"]').forEach(el => el.remove());
    };
  }, []);

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


  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

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
    setSubmissionStep('preparing');
    
    try {
      const windowSubtotal = (selections.additionalWindowsQty * additionalWindowPrice) + (selections.patioDoorsQty * patioDoorPrice) + (selections.automatedWindowsQty * automatedMotorPrice);
      const windowTotal = windowSubtotal * (1 + gstRate);
      
      // Step 1: Generate PDF
      setSubmissionStep('generating-pdf');
      let pdfBase64: string | null = null;
      try {
        const pdfPricingConfig = { 
          markupPercentage, 
          gstRate, 
          getMaterialCost, 
          getGroutColorFee,
          getAdditionalWindowPrice,
          getPatioDoorPrice,
          getAutomatedMotorPrice,
          getHeatedFloorPrice,
          getStairLvpUpgradePrice,
          getUnitAreaData,
        };
        
        const pdfResult = await generateBuyerPreviewPDF(
          {
            unitNumber: selections.unitNumber,
            firstName: selections.firstName,
            lastName: selections.lastName,
            phoneNumber: selections.phoneNumber,
            email: selections.email,
            estimatedPossessionDate: selections.estimatedPossessionDate,
            hasStairs: selections.hasStairs,
            lvpColour: selections.lvpColour,
            spcTileColour: selections.spcTileColour,
            backsplashOrientation: selections.backsplashOrientation,
            stairCarpetColour: selections.stairCarpetColour,
            stairLvpUpgradeSelected: selections.stairLvpUpgradeSelected,
            bedroomFlooringChoice: selections.bedroomFlooringChoice,
            bedroomCarpetColour: selections.bedroomCarpetColour,
            bedroomLvpColour: selections.bedroomLvpSameAsMain ? selections.lvpColour : selections.bedroomLvpColour,
            bedroomLvpSameAsMain: selections.bedroomLvpSameAsMain,
            additionalWindowsQty: selections.additionalWindowsQty,
            patioDoorsQty: selections.patioDoorsQty,
            automatedWindowsQty: selections.automatedWindowsQty,
            windowComments: selections.windowComments,
            lvpComments: selections.lvpComments,
            spcTileComments: selections.spcTileComments,
            salesComments: selections.salesComments,
            upgradeComments: selections.upgradeComments,
            upgradeInterestsNotes: selections.upgradeInterestsNotes,
            areaUpgrades: selections.areaUpgrades,
            upgradeFloorSelection: selections.upgradeFloorSelection,
            backsplashGrout: selections.backsplashGrout,
            bathroomTileSelected: selections.bathroomTileSelected,
            heatedFloorBathrooms: selections.heatedFloorBathrooms,
            upgradeInterests: selections.upgradeInterests,
          },
          unitInfo?.unitType || null,
          pdfPricingConfig,
          { returnBase64: true, saveToFile: false }
        );
        pdfBase64 = typeof pdfResult === 'string' ? pdfResult : null;
        console.log('PDF generated for HubSpot:', pdfBase64 ? 'success' : 'empty');
      } catch (pdfError) {
        console.warn('PDF generation failed, continuing without PDF:', pdfError);
      }
      
      // Step 2: Save & Send
      setSubmissionStep('saving');
      await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause for UX
      
      setSubmissionStep('sending');
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
          areaUpgrades: selections.areaUpgrades,
          upgradeFloorSelection: selections.upgradeFloorSelection,
          backsplashGroutEnabled: selections.backsplashGrout.enabled,
          backsplashGroutColor: selections.backsplashGrout.groutColor,
          backsplashGroutComments: selections.backsplashGrout.comments,
          stairLvpUpgradeSelected: selections.stairLvpUpgradeSelected,
          stairUpgradeType: selections.stairUpgradeType,
          premiumCarpetBedroom: selections.premiumCarpetBedroom,
          premiumUnderpadBedroom: selections.premiumUnderpadBedroom,
          premiumUnderpadStairs: selections.premiumUnderpadStairs,
          customTiledShower: selections.customTiledShower,
          pdfBase64: pdfBase64,
          documentUploads: selections.documentUploads,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Step 3: Finalize
      setSubmissionStep('syncing');
      await deleteDraft();
      
      // Step 4: Complete
      setSubmissionStep('complete');
      await new Promise(resolve => setTimeout(resolve, 1500)); // Show success briefly
      
      toast.success('Selections submitted successfully!', {
        description: 'Check your email for a confirmation with your selections.',
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
              <div className="text-2xl font-bold text-primary">${automatedMotorPrice.toFixed(2)}</div>
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
        {/* Premium LVP Educational Section */}
        <PremiumLVPShowcase />

        {/* Premium Carpet Educational Section */}
        <PremiumCarpetShowcase />
        {/* Room-based Flooring & Tile Upgrades */}
        <div className="p-5 rounded-xl border-2 border-primary bg-primary/5">
          <h3 className="text-xl font-serif font-semibold text-foreground mb-2 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">→</span>
            Select Areas to Upgrade
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Click on a room below to select upgrade materials. Pricing is calculated based on your unit's square footage.
          </p>
          <RoomUpgradePicker
            unitTypeCode={unitInfo?.typeCode || null}
            selectedFloor={selections.upgradeFloorSelection}
            selections={selections.areaUpgrades}
            onSelectionsChange={(newSelections) => updateSelection('areaUpgrades', newSelections)}
            onFloorChange={(floor) => updateSelection('upgradeFloorSelection', floor)}
          />
        </div>

        {/* Pricing Summary */}
        <UpgradePricingSummary
          unitTypeCode={unitInfo?.typeCode || null}
          selectedFloor={selections.upgradeFloorSelection}
          areaUpgrades={selections.areaUpgrades}
          backsplashGrout={selections.backsplashGrout}
          upgradeComments={selections.upgradeComments}
          onUpgradeCommentsChange={(comments) => updateSelection('upgradeComments', comments)}
          bathroomTileSelected={selections.bathroomTileSelected}
          heatedFloorBathrooms={selections.heatedFloorBathrooms}
          customTiledShower={selections.customTiledShower}
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
      title="Comments & Documents"
      subtitle="Add notes and attach any relevant documents such as drawings or floor plans"
      badge="Optional"
    >
      <div className="space-y-8 max-w-2xl">
        {/* Meeting Notes Section */}
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

        {/* Document Upload Section */}
        <div className="p-5 rounded-xl bg-secondary/50 border border-border">
          <div className="flex items-center gap-3 mb-4">
            <Paperclip className="w-5 h-5 text-primary" />
            <span className="font-medium text-foreground">Attach Documents</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Upload any drawings, floor plans, or other documents that may be helpful for your selections. 
            These will be included with your submission and sent to the BMD team.
          </p>
          <DocumentUploader
            unitNumber={selections.unitNumber}
            uploads={selections.documentUploads}
            onUploadsChange={(uploads) => updateSelection('documentUploads', uploads)}
            maxFiles={5}
            maxSizeMB={10}
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
            {selections.bathroomTileSelected && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Porcelain Tile Upgrade</span>
                <span className="font-medium text-primary">Yes</span>
              </div>
            )}
            {selections.heatedFloorBathrooms > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Heated Tile Floor</span>
                <span className="font-medium text-primary">{selections.heatedFloorBathrooms} bathroom{selections.heatedFloorBathrooms > 1 ? 's' : ''}</span>
              </div>
            )}
            {selections.customTiledShower && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Custom Tiled Shower</span>
                <span className="font-medium text-primary">Yes</span>
              </div>
            )}
            {selections.hasStairs && (
              selections.stairUpgradeType === 'premium_lvp' ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stairs Flooring</span>
                  <span className="font-medium text-primary">Premium LVP with Custom Nosings</span>
                </div>
              ) : selections.stairUpgradeType === 'lvp' ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stairs Flooring</span>
                  <span className="font-medium text-primary">LVP with Custom Nosings</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stairs Carpet</span>
                  <span className="font-medium">
                    {carpetOptions.find(o => o.id === selections.stairCarpetColour)?.name || 'Not selected'}
                  </span>
                </div>
              )
            )}
            {selections.hasStairs && selections.stairUpgradeType === 'standard' && selections.premiumUnderpadStairs && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Premium Underpad (Stairs)</span>
                <span className="font-medium text-primary">Yes</span>
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
            {selections.bedroomFlooringChoice === 'carpet' && selections.premiumCarpetBedroom && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Premium Carpet (Bedrooms)</span>
                <span className="font-medium text-primary">Yes</span>
              </div>
            )}
            {selections.bedroomFlooringChoice === 'carpet' && selections.premiumUnderpadBedroom && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Premium Underpad (Bedrooms)</span>
                <span className="font-medium text-primary">Yes</span>
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
              <div className="flex justify-between pt-2 border-t border-border mt-2">
                <span className="text-muted-foreground">Grout Color Change</span>
                <span className="font-medium text-primary">
                  {selections.backsplashGrout.groutColor || 'Custom'} — See pricing below
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Window Coverings - Selection details only, pricing in summary */}
        {(selections.additionalWindowsQty > 0 || selections.patioDoorsQty > 0 || selections.automatedWindowsQty > 0) && (
          <div className="p-4 rounded-xl border border-border bg-card">
            <h4 className="font-medium text-foreground mb-3">Window Coverings</h4>
            <div className="grid gap-2 text-sm">
              {selections.additionalWindowsQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Additional Windows</span>
                  <span className="font-medium">{selections.additionalWindowsQty} unit{selections.additionalWindowsQty > 1 ? 's' : ''}</span>
                </div>
              )}
              {selections.patioDoorsQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patio Door Panel Track</span>
                  <span className="font-medium">{selections.patioDoorsQty} unit{selections.patioDoorsQty > 1 ? 's' : ''}</span>
                </div>
              )}
              {selections.automatedWindowsQty > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Somfy Automation</span>
                  <span className="font-medium">{selections.automatedWindowsQty} motor{selections.automatedWindowsQty > 1 ? 's' : ''}</span>
                </div>
              )}
              {selections.windowComments && (
                <div className="pt-2 border-t border-border mt-2">
                  <span className="text-muted-foreground">Comments: </span>
                  <span className="text-foreground">{selections.windowComments}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comprehensive Upgrade Pricing Summary - ALL upgrades consolidated */}
        {(() => {
          const hasAnyUpgrade = 
            selections.stairLvpUpgradeSelected ||
            selections.backsplashGrout?.enabled ||
            selections.additionalWindowsQty > 0 ||
            selections.patioDoorsQty > 0 ||
            selections.automatedWindowsQty > 0 ||
            selections.areaUpgrades.length > 0 ||
            selections.heatedFloorBathrooms > 0 ||
            selections.customTiledShower ||
            selections.bathroomTileSelected;

          if (!hasAnyUpgrade) return null;

          return (
            <div className="p-4 rounded-xl border-2 border-primary/40 bg-primary/5">
              <UpgradePricingSummary
                unitTypeCode={unitInfo?.typeCode || null}
                selectedFloor={selections.upgradeFloorSelection}
                areaUpgrades={selections.areaUpgrades}
                backsplashGrout={selections.backsplashGrout}
                stairLvpUpgradeSelected={selections.stairLvpUpgradeSelected}
                windowCoverings={{
                  additionalWindowsQty: selections.additionalWindowsQty,
                  patioDoorsQty: selections.patioDoorsQty,
                  automatedWindowsQty: selections.automatedWindowsQty,
                }}
                bathroomTileSelected={selections.bathroomTileSelected}
                heatedFloorBathrooms={selections.heatedFloorBathrooms}
                customTiledShower={selections.customTiledShower}
              />
            </div>
          );
        })()}

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
              const pricingConfig = { 
                markupPercentage, 
                gstRate, 
                getMaterialCost, 
                getGroutColorFee,
                getAdditionalWindowPrice,
                getPatioDoorPrice,
                getAutomatedMotorPrice,
                getHeatedFloorPrice,
                getStairLvpUpgradePrice,
                getUnitAreaData,
              };
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
            title="Main Floor Flooring - LVP"
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
                    priority={true}
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
            title="Bathroom & Laundry Flooring - LVT"
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

              {/* Porcelain Tile Upgrade Option */}
              <div className="pt-4 border-t border-border space-y-4">
                <div className="flex items-start gap-3">
                  <Switch
                    id="bathroomTileUpgrade"
                    checked={selections.bathroomTileSelected}
                    onCheckedChange={(checked) => {
                      updateSelection('bathroomTileSelected', checked);
                      if (!checked) {
                        updateSelection('heatedFloorBathrooms', 0);
                      }
                    }}
                  />
                  <div className="flex-1">
                    <Label htmlFor="bathroomTileUpgrade" className="text-foreground font-medium cursor-pointer">
                      Upgrade to Porcelain Tile
                    </Label>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Replace the standard LVT with premium porcelain tile in your bathrooms
                    </p>
                    {(() => {
                      const tileCost = getMaterialCost('tile' as MaterialType);
                      const code = unitInfo?.typeCode?.toUpperCase() || '';
                      // For G/H units, try both floors and combine bathroom areas
                      let guestBathArea = 0;
                      let ensuiteArea = 0;
                      if (['G', 'H'].includes(code)) {
                        const data1 = getUnitAreaData(`${code}-1`);
                        const data2 = getUnitAreaData(`${code}-2`);
                        guestBathArea = Math.max(data1?.guestBathroom || 0, data2?.guestBathroom || 0);
                        ensuiteArea = Math.max(data1?.masterEnsuite || 0, data2?.masterEnsuite || 0);
                      } else {
                        const areaData = getUnitAreaData(code);
                        guestBathArea = areaData?.guestBathroom || 0;
                        ensuiteArea = areaData?.masterEnsuite || 0;
                      }
                      const totalArea = guestBathArea + ensuiteArea;
                      const baseCost = totalArea * tileCost;
                      const markedUp = baseCost * (1 + markupPercentage);
                      const tileTotal = markedUp * (1 + gstRate);
                      
                      return totalArea > 0 ? (
                        <p className="text-sm font-medium text-primary mt-1">
                          ${tileTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (incl. GST)
                        </p>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Heated Floor Option - only when tile is selected */}
                {selections.bathroomTileSelected && (
                  <div className="ml-8 p-4 rounded-lg bg-muted/50 space-y-3">
                    <div className="flex items-start gap-3">
                      <Switch
                        id="heatedFloor"
                        checked={selections.heatedFloorBathrooms > 0}
                        onCheckedChange={(checked) => {
                          updateSelection('heatedFloorBathrooms', checked ? 1 : 0);
                        }}
                      />
                      <div className="flex-1">
                        <Label htmlFor="heatedFloor" className="text-foreground font-medium cursor-pointer">
                          Add Heated Tile Floor
                        </Label>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Radiant in-floor heating for your tiled bathroom — includes porcelain tile plus in-floor heat
                        </p>
                        {(() => {
                          const heatWithGst = heatedFloorPrice * (1 + gstRate);
                          return heatWithGst > 0 ? (
                            <p className="text-sm font-medium text-primary mt-1">
                              ${heatWithGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per bathroom (incl. GST)
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    {selections.heatedFloorBathrooms > 0 && (() => {
                      const code = unitInfo?.typeCode?.toUpperCase() || '';
                      let guestBathArea = 0;
                      let ensuiteArea = 0;
                      if (['G', 'H'].includes(code)) {
                        const data1 = getUnitAreaData(`${code}-1`);
                        const data2 = getUnitAreaData(`${code}-2`);
                        guestBathArea = Math.max(data1?.guestBathroom || 0, data2?.guestBathroom || 0);
                        ensuiteArea = Math.max(data1?.masterEnsuite || 0, data2?.masterEnsuite || 0);
                      } else {
                        const areaData = getUnitAreaData(code);
                        guestBathArea = areaData?.guestBathroom || 0;
                        ensuiteArea = areaData?.masterEnsuite || 0;
                      }
                      const bathroomCount = (guestBathArea > 0 ? 1 : 0) + (ensuiteArea > 0 ? 1 : 0);
                      
                      return bathroomCount > 1 ? (
                        <div className="ml-8 space-y-2">
                          <Label className="text-sm text-foreground">Number of bathrooms to heat</Label>
                          <div className="flex gap-3">
                            {[1, 2].filter(n => n <= bathroomCount).map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => updateSelection('heatedFloorBathrooms', n)}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                  selections.heatedFloorBathrooms === n
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                                }`}
                              >
                                {n} bathroom{n > 1 ? 's' : ''}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {/* Custom Tiled Shower Option */}
              <div className="pt-4 border-t border-border space-y-4">
                <div className="flex items-start gap-3">
                  <Switch
                    id="customTiledShower"
                    checked={selections.customTiledShower}
                    onCheckedChange={(checked) => {
                      updateSelection('customTiledShower', checked);
                    }}
                  />
                  <div className="flex-1">
                    <Label htmlFor="customTiledShower" className="text-foreground font-medium cursor-pointer">
                      Custom Tiled Shower
                    </Label>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Custom waterproofed and tiled shower with three walls and the shower floor included
                    </p>
                    {(() => {
                      const showerCost = getMaterialCost('tiled_shower' as MaterialType);
                      if (!showerCost) return null;
                      const markedUp = showerCost * (1 + markupPercentage);
                      const total = markedUp * (1 + gstRate);
                      return (
                        <p className="text-sm font-medium text-primary mt-1">
                          ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (incl. GST)
                        </p>
                      );
                    })()}
                  </div>
                </div>
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
          : { baseCost: 0, markedUpCost: 0, gst: 0, total: 0 };
        
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
                  Your backsplash comes with standard white grout. Want a different color? Add a custom grout color for ${groutColorChangePrice.toLocaleString()} + GST.
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
                        <p className="text-xs text-muted-foreground">${groutPrice.baseCost.toLocaleString()} + GST (${groutPrice.total.toFixed(2)} total)</p>
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
                        loading="eager"
                        decoding="async"
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
                        loading="eager"
                        decoding="async"
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
                    {carpetOptions.map((option, index) => (
                      <SelectionCard
                        key={option.id}
                        id={option.id}
                        name={option.name}
                        image={option.image}
                        selected={selections.bedroomCarpetColour === option.id}
                        onSelect={(id) => updateSelection('bedroomCarpetColour', id)}
                        variant="image"
                        priority={index < 4}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Premium Carpet Upgrade - show if carpet selected */}
              {selections.bedroomFlooringChoice === 'carpet' && (() => {
                const unitData = getUnitAreaData(bedroomUnderpadUnitTypeCode);
                const carpetSqyd = unitData ? (unitData.secondBedroomCarpet + unitData.masterBedroom) : 0;
                const premiumCarpetCostPerSqyd = getMaterialCost('carpet' as any);
                const premiumCarpetBaseCost = carpetSqyd * premiumCarpetCostPerSqyd;
                const premiumCarpetMarkedUp = premiumCarpetBaseCost * (1 + markupPercentage);
                const premiumCarpetWithGst = premiumCarpetMarkedUp * (1 + gstRate);
                return carpetSqyd > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`p-5 rounded-xl border-2 transition-all cursor-pointer ${
                      selections.premiumCarpetBedroom
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                    onClick={() => updateSelection('premiumCarpetBedroom', !selections.premiumCarpetBedroom)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selections.premiumCarpetBedroom
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground'
                      }`}>
                        {selections.premiumCarpetBedroom && <Check className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-foreground">
                            Upgrade to Premium Carpet
                          </h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-accent/20 text-accent-foreground">
                            ${premiumCarpetMarkedUp.toFixed(2)} + GST
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-3">
                          Upgrade your bedroom carpet to a higher quality premium carpet for enhanced softness, durability, and luxury feel.
                        </p>
                        <ul className="space-y-1 text-sm">
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Superior softness and comfort
                          </li>
                          <li className="flex items-center gap-2 text-muted-foreground">
                            <Check className="w-4 h-4 text-success" />
                            Enhanced durability and longer lifespan
                          </li>
                        </ul>
                        {selections.premiumCarpetBedroom && (
                          <div className="mt-4 pt-3 border-t border-border">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-foreground font-medium">Total with GST:</span>
                              <span className="text-primary font-semibold text-lg">
                                ${premiumCarpetWithGst.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ) : null;
              })()}

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
