import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface StepContainerProps {
  title: string;
  subtitle?: string;
  badge?: string;
  children: ReactNode;
}

export function StepContainer({ title, subtitle, badge, children }: StepContainerProps) {
  // The running-total rail is laid out by SelectionWizard OUTSIDE the AnimatePresence subtree. It must never be
  // injected here: a step that is exiting is frozen by AnimatePresence(mode="wait"), and if the rail appears or
  // disappears mid-exit the wrapper changes shape, this motion.div remounts, its exit never completes, and the
  // wizard locks on the old step (2026-11-25 Flooring -> Bathroom freeze).
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 min-w-0"
    >
      <div className="space-y-2">
        {badge && (
          <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">
            {badge}
          </span>
        )}
        <h2 className="font-serif text-2xl md:text-3xl font-semibold text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      
      <div className="pt-2">
        {children}
      </div>
    </motion.div>
  );
}
