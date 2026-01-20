import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardProgressProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  allStepsVisited?: boolean;
  hasUnsavedChanges?: boolean;
}

export function WizardProgress({ 
  steps, 
  currentStep, 
  onStepClick, 
  allStepsVisited = false,
  hasUnsavedChanges = false,
}: WizardProgressProps) {
  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between relative">
        {/* Progress line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-border" />
        <div 
          className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500"
          style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
        />
        
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          // Allow clicking on any step if all steps visited, otherwise only completed/current
          const isClickable = onStepClick && (allStepsVisited || index <= currentStep);
          // Show unsaved indicator only on current step when there are unsaved changes
          const showUnsavedIndicator = isCurrent && hasUnsavedChanges;
          
          return (
            <div 
              key={step}
              className="flex flex-col items-center relative z-10"
              onClick={() => isClickable && onStepClick(index)}
            >
              <div className="relative">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300",
                    isCompleted && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                    isClickable && "cursor-pointer hover:scale-110 hover:ring-2 hover:ring-primary/30"
                  )}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : index + 1}
                </div>
                {/* Unsaved changes indicator dot */}
                {showUnsavedIndicator && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-warning rounded-full border-2 border-background animate-pulse" />
                )}
              </div>
              <span 
                className={cn(
                  "mt-2 text-xs font-medium text-center max-w-[80px] hidden sm:block",
                  (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
