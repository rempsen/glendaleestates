import { createContext, type ReactNode } from 'react';

/**
 * The wizard's running-total rail (spec §6.16). SelectionWizard provides it from the first priced step onward;
 * StepContainer then becomes a two-column shell at lg+ (content + 320 px rail). Below lg the rail renders its own
 * fixed bottom bar, so the layout stays a single column.
 */
export const StepRailContext = createContext<ReactNode>(null);
