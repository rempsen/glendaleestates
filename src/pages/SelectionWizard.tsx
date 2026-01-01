import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { WizardProgress } from '@/components/WizardProgress';
import { StepContainer } from '@/components/StepContainer';
import { SelectionCard } from '@/components/SelectionCard';
import { PricingDisplay } from '@/components/PricingDisplay';
import { UpgradeTeaser } from '@/components/UpgradeTeaser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  lvpOptions, 
  lvpSpecs,
  spcTileOptions, 
  spcTileSpecs,
  backsplashProduct,
  backsplashOrientations, 
  carpetOptions,
  carpetSpecs,
  windowCoveringProduct
} from '@/lib/mockData';
import { ArrowLeft, ArrowRight, Check, Home, Send, Info } from 'lucide-react';
import { toast } from 'sonner';

const STEPS = ['Home Info', 'Flooring', 'Bathroom', 'Backsplash', 'Bedrooms', 'Windows', 'Upgrades', 'Review'];

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
  backsplashOrientation: string;
  stairCarpetColour: string;
  bedroomFlooringChoice: 'carpet' | 'lvp' | '';
  bedroomCarpetColour: string;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  upgradeInterests: Record<string, boolean>;
}

export default function SelectionWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  
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
    backsplashOrientation: '',
    stairCarpetColour: '',
    bedroomFlooringChoice: '',
    bedroomCarpetColour: '',
    additionalWindowsQty: 0,
    patioDoorsQty: 0,
    upgradeInterests: {
      flooring: false,
      tile: false,
      'heated-floor': false,
      automation: false,
    },
  });

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
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = () => {
    toast.success('Selections submitted successfully!', {
      description: 'Your selections have been saved. Our team will review and be in touch.',
    });
    navigate('/');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Home Info
        return (
          <StepContainer
            title="Your Home Information"
            subtitle="Please enter your details to get started"
            badge="Step 1 of 8"
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

      case 1: // Main Floor LVP
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

      case 2: // Bathroom SPC Tile
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
            </div>
          </StepContainer>
        );

      case 3: // Backsplash
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
                  <SelectionCard
                    key={option.id}
                    id={option.id}
                    name={option.name}
                    description={option.description}
                    selected={selections.backsplashOrientation === option.id}
                    onSelect={(id) => updateSelection('backsplashOrientation', id)}
                    variant="text"
                  />
                ))}
              </div>
            </div>
          </StepContainer>
        );

      case 4: // Bedrooms & Stairs
        return (
          <StepContainer
            title="Stairs & Bedroom Flooring"
            subtitle="Customize your upstairs areas with premium carpet or matching LVP — included at no additional cost"
            badge="Included"
          >
            <div className="space-y-8">
              {/* Stairs Carpet (if applicable) */}
              {selections.hasStairs && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="font-medium text-foreground">Stairs Carpet Colour</h3>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">Required</span>
                  </div>
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
              )}

              {/* Bedroom Flooring Choice */}
              <div>
                <h3 className="font-medium text-foreground mb-4">Bedroom Flooring</h3>
                <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  Choosing carpet or plank in bedrooms does not affect your price.
                </p>
                <div className="grid grid-cols-2 gap-4 max-w-md">
                  <SelectionCard
                    id="carpet"
                    name="Carpet"
                    description="Premium broadloom carpet — soft and warm underfoot"
                    selected={selections.bedroomFlooringChoice === 'carpet'}
                    onSelect={() => updateSelection('bedroomFlooringChoice', 'carpet')}
                    variant="text"
                  />
                  <SelectionCard
                    id="lvp"
                    name="Luxury Vinyl Plank"
                    description="Matching LVP from main floor — durable and easy to clean"
                    selected={selections.bedroomFlooringChoice === 'lvp'}
                    onSelect={() => updateSelection('bedroomFlooringChoice', 'lvp')}
                    variant="text"
                  />
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
            </div>
          </StepContainer>
        );

      case 5: // Window Coverings
        return (
          <StepContainer
            title="Window Coverings"
            subtitle="Standard bedroom roller shades are included. Extend to other rooms for a cohesive look."
            badge="Standard + Optional"
          >
            <div className="space-y-8">
              {/* Standard Confirmation */}
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

              {/* Optional Extensions */}
              <div className="p-6 rounded-xl border border-border bg-card">
                <h3 className="font-medium text-foreground mb-2">Optional Extensions</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Add matching window coverings to other rooms for a cohesive look throughout your home.
                </p>

                <div className="space-y-6">
                  <div>
                    <Label htmlFor="additionalWindows" className="text-foreground">
                      Additional Non-Bedroom Windows
                    </Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Living room, dining room, kitchen, etc. — $585 per window (pre-GST)
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

                  <div>
                    <Label htmlFor="patioDoors" className="text-foreground">
                      Patio Door Panel Track Systems
                    </Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Sliding panel track for patio doors — $1,275 per opening (pre-GST)
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
                </div>

                <div className="mt-6">
                  <PricingDisplay
                    additionalWindows={selections.additionalWindowsQty}
                    patioDoors={selections.patioDoorsQty}
                  />
                </div>
              </div>
            </div>
          </StepContainer>
        );

      case 6: // Upgrades
        return (
          <StepContainer
            title="Explore Premium Upgrades"
            subtitle="Express interest in premium options — no obligation, we'll provide details later"
            badge="Coming Soon"
          >
            <UpgradeTeaser
              selectedInterests={selections.upgradeInterests}
              onToggleInterest={toggleUpgradeInterest}
            />
            
            <p className="mt-6 text-sm text-muted-foreground">
              These premium upgrades are available for an additional cost. 
              Mark any that interest you and our team will reach out with details and pricing.
            </p>
          </StepContainer>
        );

      case 7: // Review
        return (
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
                </div>
              </div>

              {/* Window Extensions */}
              {(selections.additionalWindowsQty > 0 || selections.patioDoorsQty > 0) && (
                <div className="p-4 rounded-xl border border-accent/30 bg-accent/5">
                  <h4 className="font-medium text-foreground mb-3">Window Covering Extensions</h4>
                  <PricingDisplay
                    additionalWindows={selections.additionalWindowsQty}
                    patioDoors={selections.patioDoorsQty}
                  />
                </div>
              )}

              {/* Upgrade Interests */}
              {Object.values(selections.upgradeInterests).some(v => v) && (
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h4 className="font-medium text-foreground mb-3">Upgrade Interests</h4>
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
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Logo />
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              Save & Exit
            </Button>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="border-b border-border bg-card">
        <div className="container max-w-5xl mx-auto px-4">
          <WizardProgress
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={setCurrentStep}
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

          {currentStep < STEPS.length - 1 ? (
            <Button onClick={nextStep} className="gap-2">
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="hero" onClick={handleSubmit} className="gap-2">
              <Send className="w-4 h-4" />
              Submit Selections
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
