import { upgradeInterestCategories } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { Check, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface UpgradeTeaserProps {
  selectedInterests: Record<string, boolean>;
  onToggleInterest: (id: string) => void;
}

export function UpgradeTeaser({ selectedInterests, onToggleInterest }: UpgradeTeaserProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {upgradeInterestCategories.map((option, index) => {
        const isSelected = selectedInterests[option.id] || false;
        
        return (
          <motion.button
            key={option.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => onToggleInterest(option.id)}
            className={cn(
              "relative p-5 rounded-xl border-2 text-left transition-all duration-200",
              isSelected
                ? "border-accent bg-accent/10"
                : "border-border bg-card hover:border-accent/50"
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className={cn(
                  "w-4 h-4",
                  isSelected ? "text-accent" : "text-muted-foreground"
                )} />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Premium Upgrade
                </span>
              </div>
              
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                isSelected
                  ? "bg-accent border-accent"
                  : "border-border"
              )}>
                {isSelected && <Check className="w-3 h-3 text-accent-foreground" />}
              </div>
            </div>
            
            <h4 className={cn(
              "font-serif text-lg font-medium mb-1",
              isSelected ? "text-accent" : "text-foreground"
            )}>
              {option.name}
            </h4>
            
            <p className="text-sm text-muted-foreground">
              {option.description}
            </p>
            
            {isSelected && (
              <span className="mt-3 inline-block text-xs font-medium text-accent">
                ✓ We'll contact you with details
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
