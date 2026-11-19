import type { OverrideKey } from '@/lib/customPricing';

/** Office price override rows in the Custom Pricing panel; one per engine override key (guarded by scripts/custom-pricing-overrides.test.ts). */
export const OVERRIDES: Array<{ key: OverrideKey; title: string; hint: string }> = [
  { key: 'stair', title: 'Stair upgrade', hint: 'Applies when stairs are upgraded to LVP' },
  { key: 'stairCarpet', title: 'Stairs to Lower Level — Premium Carpet', hint: 'Applies when premium carpet is selected and stairs are not upgraded to LVP' },
  { key: 'stairUnderpad', title: 'Stairs to Lower Level — Premium Underpad', hint: 'Applies when premium underpad is selected and stairs are not upgraded to LVP' },
  { key: 'bedroomCarpet', title: 'Primary Bedroom premium carpet', hint: 'Applies when premium carpet is selected for carpeted bedrooms' },
  { key: 'bedroomUnderpad', title: 'Primary Bedroom premium underpad', hint: 'Applies when premium underpad is selected for carpeted bedrooms (enter 0 to waive)' },
  { key: 'grout', title: 'Backsplash / grout', hint: 'Applies when grout colour change is on' },
  { key: 'bathroomTile', title: 'Bathroom porcelain tile', hint: 'Applies when the bathroom tile upgrade is on' },
  { key: 'heatedFloor', title: 'Heated tile floor', hint: 'Applies when at least one heated bathroom is set' },
  { key: 'customShower', title: 'Custom tiled shower', hint: 'Applies when the custom shower is on' },
];
