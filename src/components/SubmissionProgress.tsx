import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, FileText, Database, Mail, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export type SubmissionStep = 
  | 'preparing'
  | 'generating-pdf'
  | 'saving'
  | 'sending'
  | 'syncing'
  | 'complete';

interface SubmissionProgressProps {
  currentStep: SubmissionStep;
  isVisible: boolean;
}

const stepConfig: Record<SubmissionStep, { 
  label: string; 
  description: string; 
  icon: React.ElementType;
  progress: number;
}> = {
  preparing: {
    label: 'Preparing',
    description: 'Getting your selections ready...',
    icon: Sparkles,
    progress: 10,
  },
  'generating-pdf': {
    label: 'Generating PDF',
    description: 'Creating your selection summary document...',
    icon: FileText,
    progress: 30,
  },
  saving: {
    label: 'Saving',
    description: 'Securely storing your selections...',
    icon: Database,
    progress: 50,
  },
  sending: {
    label: 'Sending',
    description: 'Emailing your confirmation...',
    icon: Mail,
    progress: 75,
  },
  syncing: {
    label: 'Finalizing',
    description: 'Syncing with our systems...',
    icon: Loader2,
    progress: 90,
  },
  complete: {
    label: 'Complete!',
    description: 'Your selections have been submitted successfully!',
    icon: Check,
    progress: 100,
  },
};

const stepOrder: SubmissionStep[] = [
  'preparing',
  'generating-pdf',
  'saving',
  'sending',
  'syncing',
  'complete',
];

export function SubmissionProgress({ currentStep, isVisible }: SubmissionProgressProps) {
  const config = stepConfig[currentStep];
  const IconComponent = config.icon;
  const currentStepIndex = stepOrder.indexOf(currentStep);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="w-full max-w-md mx-4 p-8 bg-card border border-border rounded-2xl shadow-2xl"
          >
            {/* Main Icon */}
            <div className="flex justify-center mb-6">
              <motion.div
                key={currentStep}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', duration: 0.4 }}
                className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  currentStep === 'complete'
                    ? 'bg-success/20 text-success'
                    : 'bg-primary/20 text-primary'
                }`}
              >
                <IconComponent
                  className={`w-10 h-10 ${
                    currentStep !== 'complete' && currentStep !== 'preparing'
                      ? 'animate-spin'
                      : currentStep === 'complete'
                      ? 'animate-none'
                      : 'animate-pulse'
                  }`}
                  style={{
                    animationDuration:
                      currentStep === 'generating-pdf' ? '2s' : '1s',
                  }}
                />
              </motion.div>
            </div>

            {/* Step Label */}
            <motion.div
              key={`label-${currentStep}`}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center mb-6"
            >
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {config.label}
              </h3>
              <p className="text-sm text-muted-foreground">
                {config.description}
              </p>
            </motion.div>

            {/* Progress Bar */}
            <div className="space-y-3">
              <Progress value={config.progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Step {currentStepIndex + 1} of {stepOrder.length}</span>
                <span>{config.progress}%</span>
              </div>
            </div>

            {/* Step Indicators */}
            <div className="flex justify-center gap-2 mt-6">
              {stepOrder.map((step, index) => {
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                
                return (
                  <motion.div
                    key={step}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      isCompleted
                        ? 'bg-success'
                        : isCurrent
                        ? 'bg-primary'
                        : 'bg-muted'
                    }`}
                    animate={isCurrent ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1 }}
                  />
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
