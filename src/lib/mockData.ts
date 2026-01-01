// Mock data for Glendale Estates - 75 homes

export type SelectionStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'finalized';

export interface HomeData {
  id: string;
  lot: string;
  address: string;
  buyerName: string;
  buyerEmail: string;
  status: SelectionStatus;
  flooringCompleted: boolean;
  windowExtensions: boolean;
  estimatedUpgradeValue: number;
  lastActivityDate: string;
  selections?: SelectionData;
}

export interface SelectionData {
  mainFloorLVP: string | null;
  washroomSPC: string | null;
  backsplashOrientation: 'stacked' | 'bricked' | 'horizontal' | null;
  stairsCarpet: string | null;
  bedroomFlooring: {
    [key: string]: 'carpet' | 'lvp';
  };
  bedroomCarpetColor: string | null;
  standardWindowCoverings: boolean;
  additionalWindows: number;
  patioDoors: number;
  upgradeInterests: string[];
}

export const flooringOptions = {
  mainFloorLVP: [
    { id: 'oak-natural', name: 'Natural Oak', color: '#C4A77D' },
    { id: 'walnut-rich', name: 'Rich Walnut', color: '#6B4423' },
    { id: 'grey-wash', name: 'Grey Wash', color: '#8B8682' },
  ],
  washroomSPC: [
    { id: 'marble-white', name: 'Carrara White', color: '#F5F5F5' },
    { id: 'slate-grey', name: 'Slate Grey', color: '#708090' },
    { id: 'travertine', name: 'Travertine Beige', color: '#D4C4A8' },
  ],
  carpetColors: [
    { id: 'cream-comfort', name: 'Cream Comfort', color: '#F5F5DC' },
    { id: 'warm-grey', name: 'Warm Grey', color: '#A8A39D' },
    { id: 'charcoal-soft', name: 'Soft Charcoal', color: '#4A4A4A' },
    { id: 'taupe-blend', name: 'Taupe Blend', color: '#B09A7E' },
  ],
};

export const backsplashOrientations = [
  { id: 'stacked', name: 'Stacked', description: 'Tiles aligned vertically for a modern look' },
  { id: 'bricked', name: 'Bricked', description: 'Classic offset pattern like traditional brick' },
  { id: 'horizontal', name: 'Horizontal', description: 'Wide horizontal tiles for spacious feel' },
];

export const upgradeOptions = [
  { id: 'upgraded-flooring', name: 'Premium Flooring', description: 'European oak, wide plank options' },
  { id: 'tile-upgrades', name: 'Designer Tile', description: 'Porcelain and natural stone options' },
  { id: 'heated-floors', name: 'Heated Tile Floors', description: 'Radiant heating in bathrooms' },
  { id: 'powered-blinds', name: 'Motorized Blinds', description: 'Smart home integration ready' },
];

export const windowPricing = {
  additionalWindow: 385,
  patioDoor: 650,
  gst: 0.05,
};

// Generate 75 homes with varied data
const firstNames = ['James', 'Sarah', 'Michael', 'Jennifer', 'David', 'Emily', 'Robert', 'Amanda', 'William', 'Jessica', 'Christopher', 'Ashley', 'Daniel', 'Stephanie', 'Matthew'];
const lastNames = ['Thompson', 'Chen', 'Patel', 'Williams', 'Rodriguez', 'Kim', 'Singh', 'Anderson', 'Martinez', 'Garcia', 'Johnson', 'Lee', 'Brown', 'Wilson', 'Taylor'];
const streets = ['Glendale Way', 'Estates Drive', 'Meadow Lane', 'Summit Court', 'Valley Road'];

const statuses: SelectionStatus[] = ['not_started', 'in_progress', 'submitted', 'reviewed', 'finalized'];

function generateRandomDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * daysAgo));
  return date.toISOString().split('T')[0];
}

function generateSelections(status: SelectionStatus): SelectionData | undefined {
  if (status === 'not_started') return undefined;
  
  const isComplete = ['submitted', 'reviewed', 'finalized'].includes(status);
  
  return {
    mainFloorLVP: isComplete || Math.random() > 0.3 ? flooringOptions.mainFloorLVP[Math.floor(Math.random() * 3)].id : null,
    washroomSPC: isComplete || Math.random() > 0.3 ? flooringOptions.washroomSPC[Math.floor(Math.random() * 3)].id : null,
    backsplashOrientation: isComplete || Math.random() > 0.4 ? (['stacked', 'bricked', 'horizontal'] as const)[Math.floor(Math.random() * 3)] : null,
    stairsCarpet: isComplete || Math.random() > 0.4 ? flooringOptions.carpetColors[Math.floor(Math.random() * 4)].id : null,
    bedroomFlooring: {
      'master': Math.random() > 0.5 ? 'carpet' : 'lvp',
      'bedroom2': Math.random() > 0.5 ? 'carpet' : 'lvp',
      'bedroom3': Math.random() > 0.5 ? 'carpet' : 'lvp',
    },
    bedroomCarpetColor: isComplete || Math.random() > 0.4 ? flooringOptions.carpetColors[Math.floor(Math.random() * 4)].id : null,
    standardWindowCoverings: true,
    additionalWindows: Math.random() > 0.5 ? Math.floor(Math.random() * 6) : 0,
    patioDoors: Math.random() > 0.7 ? Math.floor(Math.random() * 3) : 0,
    upgradeInterests: upgradeOptions.filter(() => Math.random() > 0.6).map(o => o.id),
  };
}

export const homes: HomeData[] = Array.from({ length: 75 }, (_, i) => {
  const lot = `${i + 1}`.padStart(3, '0');
  const streetNum = 100 + i;
  const street = streets[Math.floor(i / 15)];
  const status = statuses[Math.floor(Math.random() * 5)];
  const selections = generateSelections(status);
  
  const additionalWindowsValue = (selections?.additionalWindows || 0) * windowPricing.additionalWindow;
  const patioDoorsValue = (selections?.patioDoors || 0) * windowPricing.patioDoor;
  
  return {
    id: `home-${lot}`,
    lot: `Lot ${lot}`,
    address: `${streetNum} ${street}`,
    buyerName: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
    buyerEmail: `buyer${lot}@email.com`,
    status,
    flooringCompleted: selections?.mainFloorLVP !== null && selections?.washroomSPC !== null,
    windowExtensions: (selections?.additionalWindows || 0) > 0 || (selections?.patioDoors || 0) > 0,
    estimatedUpgradeValue: additionalWindowsValue + patioDoorsValue,
    lastActivityDate: generateRandomDate(60),
    selections,
  };
});

export const getStatusLabel = (status: SelectionStatus): string => {
  const labels: Record<SelectionStatus, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    finalized: 'Finalized',
  };
  return labels[status];
};

export const getStatusColor = (status: SelectionStatus): string => {
  const colors: Record<SelectionStatus, string> = {
    not_started: 'bg-muted text-muted-foreground',
    in_progress: 'bg-warning/20 text-warning-foreground',
    submitted: 'bg-info/20 text-info',
    reviewed: 'bg-primary/20 text-primary',
    finalized: 'bg-success/20 text-success',
  };
  return colors[status];
};
