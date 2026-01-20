import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Clock, FileText, ArrowRight, Home, Palette, Grid3X3, Blinds, Lock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import MaterialsGuideViewer from '@/components/MaterialsGuideViewer';

export default function BuyerWelcome() {
  const navigate = useNavigate();

  const processSteps = [
    { icon: Home, title: 'Confirm Home', description: 'Verify your lot and address details' },
    { icon: Palette, title: 'Choose Finishes', description: 'Select flooring, carpet colors, and backsplash' },
    { icon: Blinds, title: 'Window Coverings', description: 'Add optional extensions to other rooms' },
    { icon: FileText, title: 'Review & Submit', description: 'Confirm selections for our review' },
  ];

  const includedItems = [
    'Main floor luxury vinyl plank flooring',
    'Washroom and laundry SPC tile',
    'Kitchen backsplash (white 3x8 subway tile)',
    'Bedroom flooring (carpet or LVP)',
    'Stairs carpet (if applicable)',
    'Standard bedroom window coverings',
  ];

  const upgradeOptions = [
    'Additional window coverings for other rooms',
    'Patio door panel track systems',
    'Premium flooring upgrades',
    'Heated tile floors',
    'Tile flooring & walls',
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        <div className="gradient-hero py-16 md:py-24">
          <div className="container max-w-5xl mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <Logo className="justify-center mb-8 [&_span]:text-primary-foreground [&_span]:opacity-80" />
              <h1 className="font-serif text-3xl md:text-5xl font-bold text-primary-foreground mb-4">
                Welcome to Your Home Selection Experience
              </h1>
              <p className="text-primary-foreground/80 text-lg md:text-xl max-w-2xl mx-auto mb-8">
                Personalize your new home with beautiful flooring, backsplash, and window covering selections.
              </p>
              <Button 
                variant="accent" 
                size="xl"
                onClick={() => navigate('/buyer-auth')}
                className="gap-2"
              >
                Begin Your Selections
                <ArrowRight className="w-5 h-5" />
              </Button>
              <p className="mt-4 text-primary-foreground/70 text-sm">
                Already have an account?{' '}
                <button 
                  onClick={() => navigate('/buyer-auth?mode=signin')}
                  className="underline hover:text-primary-foreground transition-colors"
                >
                  Sign in here
                </button>
              </p>
            </motion.div>
          </div>
        </div>
        
        {/* Decorative wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 80V40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0Z" fill="hsl(var(--background))" />
          </svg>
        </div>
      </header>

      {/* Materials Guide Viewer */}
      <MaterialsGuideViewer />

      {/* Process Timeline */}
      <section className="py-16 md:py-24">
        <div className="container max-w-5xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="font-serif text-2xl md:text-4xl font-semibold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A simple, guided process to make your home uniquely yours
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6">
            {processSteps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div className="absolute top-8 left-1/2 right-0 h-0.5 bg-border hidden md:block last:hidden" 
                       style={{ width: 'calc(100% - 2rem)', transform: 'translateX(2rem)' }} />
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold mb-2">
                    {index + 1}
                  </span>
                  <h3 className="font-serif text-lg font-medium text-foreground mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What's Included / Optional */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container max-w-5xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8 md:gap-12">
            {/* Included */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-2xl bg-card border border-border shadow-lg"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-semibold text-foreground">Included at No Cost</h3>
                  <p className="text-sm text-muted-foreground">Part of your standard package</p>
                </div>
              </div>
              
              <ul className="space-y-3">
                {includedItems.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Optional */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="p-6 md:p-8 rounded-2xl bg-card border border-accent/30 shadow-lg"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                  <Grid3X3 className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-semibold text-foreground">Optional Extensions</h3>
                  <p className="text-sm text-muted-foreground">Enhance your home experience</p>
                </div>
              </div>
              
              <ul className="space-y-3">
                {upgradeOptions.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-accent/50 mt-0.5 shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Timeline Note */}
      <section className="py-16 md:py-20">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-6 md:p-8 rounded-2xl border border-border bg-card"
          >
            <Clock className="w-10 h-10 text-primary mx-auto mb-4" />
            <h3 className="font-serif text-xl md:text-2xl font-semibold text-foreground mb-3">
              Take Your Time
            </h3>
            <p className="text-muted-foreground mb-6">
              Your selections can be saved and continued at any time. We recommend taking 15-20 minutes 
              to explore all options and make choices you'll love for years to come.
            </p>
            <Button 
              variant="hero" 
              size="lg"
              onClick={() => navigate('/buyer-auth')}
            >
              Start Selecting
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo />
            <div className="flex items-center gap-6">
              <Link 
                to="/auth" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Lock className="w-3 h-3" />
                Admin
              </Link>
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} BMD Materials. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
