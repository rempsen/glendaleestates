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
import { flooringOptions, backsplashOrientations } from '@/lib/mockData';
import { ArrowLeft, ArrowRight, Check, Home, Send } from 'lucide-react';
import { toast } from 'sonner';

const STEPS = ['Home Info', 'Flooring', 'Backsplash', 'Bedrooms', 'Windows', 'Upgrades', 'Review'];

interface SelectionState {
  lot: string;
  address: string;
  buyerName: string;
  mainFloorLVP: string;
  washroomSPC: string;
  backsplashOrientation: string;
  stairsCarpet: string;
  bedroomFlooring: Record<string, 'carpet' | 'lvp'>;
  bedroomCarpetColor: string;
  additionalWindows: number;
  patioDoors: number;
  upgradeInterests: string[];
}

export default function SelectionWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [allBedroomsSame, setAllBedroomsSame] = useState(true);
  
  const [selections, setSelections] = useState<SelectionState>({
    lot: 'Lot 042',
    address: '142 Glendale Way',
    buyerName: 'Sarah & Michael Thompson',
    mainFloorLVP: '',
    washroomSPC: '',
    backsplashOrientation: '',
    stairsCarpet: '',
    bedroomFlooring: {
      master: 'carpet',
      bedroom2: 'carpet',
      bedroom3: 'carpet',
    },
    bedroomCarpetColor: '',
    additionalWindows: 0,
    patioDoors: 0,
    upgradeInterests: [],
  });

  const updateSelection = (key: keyof SelectionState, value: any) => {
    setSelections(prev => ({ ...prev, [key]: value }));
  };

  const toggleUpgradeInterest = (id: string) => {
    setSelections(prev => ({
      ...prev,
      upgradeInterests: prev.upgradeInterests.includes(id)
        ? prev.upgradeInterests.filter(i => i !== id)
        : [...prev.upgradeInterests, id]
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
      description: 'Our team will review your choices and be in touch soon.',
    });
    navigate('/');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Home Info
        return (
          <StepContainer
            title="Confirm Your Home Information"
            subtitle="Please verify your home details before proceeding"
            badge="Step 1 of 7"
          >
            <div className="space-y-6 max-w-md">
              <div className="p-4 rounded-xl bg-secondary/50 border border-border">
                <div className="flex items-center gap-3 mb-4">
                  <Home className="w-5 h-5 text-primary" />
                  <span className="font-medium">Your Home</span>
                </div>
                <div className="grid gap-4">
                  <div>
                    <Label className="text-muted-foreground text-sm">Lot / Address</Label>
                    <p className="font-medium text-foreground">{selections.lot} — {selections.address}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Buyer Name(s)</Label>
                    <p className="font-medium text-foreground">{selections.buyerName}</p>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground">
                If any of this information is incorrect, please contact us before proceeding.
              </p>
            </div>
          </StepContainer>
        );

      case 1: // Flooring
        return (
          <StepContainer
            title="Standard Flooring Selections"
            subtitle="Choose your preferred colors from our curated collection — included at no additional cost"
            badge="Included"
          >
            <div className="space-y-8">
              <div>
                <h3 className="font-medium text-foreground mb-4">Main Floor Luxury Vinyl Plank</h3>
                <div className="grid grid-cols-3 gap-4">
                  {flooringOptions.mainFloorLVP.map(option => (
                    <SelectionCard
                      key={option.id}
                      id={option.id}
                      name={option.name}
                      color={option.color}
                      selected={selections.mainFloorLVP === option.id}
                      onSelect={(id) => updateSelection('mainFloorLVP', id)}
                      variant="color"
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-foreground mb-4">Washroom & Laundry SPC Tile</h3>
                <div className="grid grid-cols-3 gap-4">
                  {flooringOptions.washroomSPC.map(option => (
                    <SelectionCard
                      key={option.id}
                      id={option.id}
                      name={option.name}
                      color={option.color}
                      selected={selections.washroomSPC === option.id}
                      onSelect={(id) => updateSelection('washroomSPC', id)}
                      variant="color"
                    />
                  ))}
                </div>
              </div>
            </div>
          </StepContainer>
        );

      case 2: // Backsplash
        return (
          <StepContainer
            title="Kitchen Backsplash"
            subtitle="Your backsplash includes beautiful white 3×8 subway tile. Choose your preferred orientation."
            badge="Included"
          >
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
          </StepContainer>
        );

      case 3: // Bedrooms & Stairs
        return (
          <StepContainer
            title="Stairs & Bedroom Flooring"
            subtitle="Customize your upstairs areas with carpet or luxury vinyl plank"
            badge="Included"
          >
            <div className="space-y-8">
              {/* Stairs Carpet */}
              <div>
                <h3 className="font-medium text-foreground mb-4">Stairs Carpet Color</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {flooringOptions.carpetColors.map(option => (
                    <SelectionCard
                      key={option.id}
                      id={option.id}
                      name={option.name}
                      color={option.color}
                      selected={selections.stairsCarpet === option.id}
                      onSelect={(id) => updateSelection('stairsCarpet', id)}
                      variant="color"
                    />
                  ))}
                </div>
              </div>

              {/* Bedroom Flooring Toggle */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-foreground">Bedroom Flooring</h3>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={allBedroomsSame}
                      onCheckedChange={setAllBedroomsSame}
                    />
                    <Label className="text-sm text-muted-foreground">Same for all bedrooms</Label>
                  </div>
                </div>

                {allBedroomsSame ? (
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    <SelectionCard
                      id="carpet"
                      name="Carpet"
                      description="Soft and warm underfoot"
                      selected={selections.bedroomFlooring.master === 'carpet'}
                      onSelect={() => updateSelection('bedroomFlooring', {
                        master: 'carpet',
                        bedroom2: 'carpet',
                        bedroom3: 'carpet',
                      })}
                      variant="text"
                    />
                    <SelectionCard
                      id="lvp"
                      name="Luxury Vinyl Plank"
                      description="Durable and easy to clean"
                      selected={selections.bedroomFlooring.master === 'lvp'}
                      onSelect={() => updateSelection('bedroomFlooring', {
                        master: 'lvp',
                        bedroom2: 'lvp',
                        bedroom3: 'lvp',
                      })}
                      variant="text"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {['master', 'bedroom2', 'bedroom3'].map((room) => (
                      <div key={room} className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30">
                        <span className="font-medium capitalize w-28">
                          {room === 'master' ? 'Primary' : room.replace('bedroom', 'Bedroom ')}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant={selections.bedroomFlooring[room] === 'carpet' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateSelection('bedroomFlooring', {
                              ...selections.bedroomFlooring,
                              [room]: 'carpet'
                            })}
                          >
                            Carpet
                          </Button>
                          <Button
                            variant={selections.bedroomFlooring[room] === 'lvp' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateSelection('bedroomFlooring', {
                              ...selections.bedroomFlooring,
                              [room]: 'lvp'
                            })}
                          >
                            LVP
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bedroom Carpet Color - show if any bedroom has carpet */}
              {Object.values(selections.bedroomFlooring).includes('carpet') && (
                <div>
                  <h3 className="font-medium text-foreground mb-4">Bedroom Carpet Color</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {flooringOptions.carpetColors.map(option => (
                      <SelectionCard
                        key={option.id}
                        id={option.id}
                        name={option.name}
                        color={option.color}
                        selected={selections.bedroomCarpetColor === option.id}
                        onSelect={(id) => updateSelection('bedroomCarpetColor', id)}
                        variant="color"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </StepContainer>
        );

      case 4: // Window Coverings
        return (
          <StepContainer
            title="Window Coverings"
            subtitle="Standard bedroom window coverings are included. Extend to other rooms for a complete look."
            badge="Standard + Optional"
          >
            <div className="space-y-8">
              {/* Standard Confirmation */}
              <div className="p-4 rounded-xl bg-success/10 border border-success/30">
                <div className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-success" />
                  <div>
                    <p className="font-medium text-foreground">Bedroom Window Coverings Included</p>
                    <p className="text-sm text-muted-foreground">Standard window coverings for all bedrooms</p>
                  </div>
                </div>
              </div>

              {/* Optional Extensions */}
              <div className="p-6 rounded-xl border border-border bg-card">
                <h3 className="font-medium text-foreground mb-4">Optional Extensions</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Add matching window coverings to other rooms for a cohesive look throughout your home.
                </p>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="additionalWindows" className="text-foreground">
                      Additional Windows
                    </Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Living room, dining room, kitchen, etc. ($385 each)
                    </p>
                    <Input
                      id="additionalWindows"
                      type="number"
                      min={0}
                      max={20}
                      value={selections.additionalWindows}
                      onChange={(e) => updateSelection('additionalWindows', parseInt(e.target.value) || 0)}
                      className="max-w-24"
                    />
                  </div>

                  <div>
                    <Label htmlFor="patioDoors" className="text-foreground">
                      Patio Door Panel Tracks
                    </Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Sliding panel track system for patio doors ($650 each)
                    </p>
                    <Input
                      id="patioDoors"
                      type="number"
                      min={0}
                      max={5}
                      value={selections.patioDoors}
                      onChange={(e) => updateSelection('patioDoors', parseInt(e.target.value) || 0)}
                      className="max-w-24"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <PricingDisplay
                    additionalWindows={selections.additionalWindows}
                    patioDoors={selections.patioDoors}
                  />
                </div>
              </div>
            </div>
          </StepContainer>
        );

      case 5: // Upgrades
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

      case 6: // Review
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
                <p className="text-sm text-muted-foreground">
                  {selections.lot} — {selections.address}<br />
                  {selections.buyerName}
                </p>
              </div>

              {/* Flooring */}
              <div className="p-4 rounded-xl border border-border bg-card">
                <h4 className="font-medium text-foreground mb-3">Flooring Selections</h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Main Floor LVP</span>
                    <span className="font-medium">
                      {flooringOptions.mainFloorLVP.find(o => o.id === selections.mainFloorLVP)?.name || 'Not selected'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Washroom SPC</span>
                    <span className="font-medium">
                      {flooringOptions.washroomSPC.find(o => o.id === selections.washroomSPC)?.name || 'Not selected'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stairs Carpet</span>
                    <span className="font-medium">
                      {flooringOptions.carpetColors.find(o => o.id === selections.stairsCarpet)?.name || 'Not selected'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Backsplash */}
              <div className="p-4 rounded-xl border border-border bg-card">
                <h4 className="font-medium text-foreground mb-3">Kitchen Backsplash</h4>
                <p className="text-sm">
                  <span className="text-muted-foreground">Orientation: </span>
                  <span className="font-medium capitalize">{selections.backsplashOrientation || 'Not selected'}</span>
                </p>
              </div>

              {/* Window Extensions */}
              {(selections.additionalWindows > 0 || selections.patioDoors > 0) && (
                <div className="p-4 rounded-xl border border-accent/30 bg-accent/5">
                  <h4 className="font-medium text-foreground mb-3">Window Covering Extensions</h4>
                  <PricingDisplay
                    additionalWindows={selections.additionalWindows}
                    patioDoors={selections.patioDoors}
                  />
                </div>
              )}

              {/* Upgrade Interests */}
              {selections.upgradeInterests.length > 0 && (
                <div className="p-4 rounded-xl border border-border bg-card">
                  <h4 className="font-medium text-foreground mb-3">Upgrade Interests</h4>
                  <p className="text-sm text-muted-foreground">
                    You've expressed interest in: {selections.upgradeInterests.join(', ')}
                  </p>
                </div>
              )}

              {/* Note */}
              <div className="p-4 rounded-xl bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Final pricing and payment will be handled separately. 
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
        <div className="container max-w-4xl mx-auto px-4">
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
