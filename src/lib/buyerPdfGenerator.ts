import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  lvpOptions, 
  spcTileOptions, 
  carpetOptions, 
  backsplashProduct,
} from '@/lib/mockData';
import { 
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  normalizeUnitTypeCode,
  AREA_DEFINITIONS,
  UNIT_AREA_DATA,
  UPGRADE_MATERIALS,
  MaterialType,
} from '@/lib/upgradeCostData';

// Unit area data structure (camelCase for internal use)
export interface UnitAreaDataForPdf {
  allLvp: number;
  mainLiving: number;
  secondBedroom: number;
  masterBedroomLvp: number;
  masterBedroom: number;
  secondBedroomCarpet: number;
  guestBathroom: number;
  masterEnsuite: number;
  laundry: number;
  backsplash: number;
}

// Pricing config interface for dynamic pricing
export interface PdfPricingConfig {
  markupPercentage: number;
  gstRate: number;
  getMaterialCost: (materialType: MaterialType) => number;
  getGroutColorFee: () => number;
  getAdditionalWindowPrice: () => number;
  getPatioDoorPrice: () => number;
  getAutomatedMotorPrice: () => number;
  getHeatedFloorPrice: () => number;
  getStairLvpUpgradePrice?: () => number;
  getStairCarpetUpgradePrice?: () => number;
  getUnitAreaData?: (unitTypeCode: string) => UnitAreaDataForPdf | null;
}

// BMD brand colors
const COLORS = {
  primary: [45, 70, 60] as [number, number, number],
  secondary: [180, 140, 130] as [number, number, number],
  dark: [40, 40, 40] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  light: [245, 243, 240] as [number, number, number],
};

// Helper function to resolve G/H unit codes to floor-specific codes
function resolveFloorSpecificUnitCode(
  unitTypeCode: string,
  upgradeFloorSelection: '1' | '2' | null,
  pricing: PdfPricingConfig
): string {
  const upper = unitTypeCode.toUpperCase().trim();
  
  // If already floor-specific (G-1, G-2, H-1, H-2), return as-is
  if (upper.includes('-')) {
    return upper;
  }
  
  // For G and H units without floor specification, try to resolve
  if (upper === 'G' || upper === 'H') {
    // If user selected a floor, use that
    if (upgradeFloorSelection) {
      return `${upper}-${upgradeFloorSelection}`;
    }
    
    // Try to find data by checking if G-1/G-2 or H-1/H-2 exists
    // Combine both floors' data by trying each floor
    const floor1Code = `${upper}-1`;
    const floor2Code = `${upper}-2`;
    
    // Try floor 1 first, then floor 2
    if (pricing.getUnitAreaData) {
      const floor1Data = pricing.getUnitAreaData(floor1Code);
      if (floor1Data) return floor1Code;
      
      const floor2Data = pricing.getUnitAreaData(floor2Code);
      if (floor2Data) return floor2Code;
    }
    
    // Fall back to the original code
    return upper;
  }
  
  return upper;
}

// Helper function to calculate upgrade cost with dynamic pricing
// Returns line items for ALL selections, calculating cost per area
function calculateUpgradeCost(
  unitTypeCode: string,
  selections: AreaUpgradeSelection[],
  pricing: PdfPricingConfig,
  upgradeFloorSelection?: '1' | '2' | null
): { subtotal: number; gst: number; total: number; lineItems: Array<{ areaId: string; areaName: string; quantity: number; unit: string; markedUpCost: number; heatedFloor?: boolean; heatedFloorCost?: number }> } {
  let subtotal = 0;
  const lineItems: Array<{ areaId: string; areaName: string; quantity: number; unit: string; markedUpCost: number; heatedFloor?: boolean; heatedFloorCost?: number }> = [];

  // Resolve floor-specific unit code for G/H units
  const resolvedUnitCode = resolveFloorSpecificUnitCode(unitTypeCode, upgradeFloorSelection || null, pricing);

  // Use dynamic unit area data if provided, otherwise fall back to static data
  const unitData = pricing.getUnitAreaData 
    ? pricing.getUnitAreaData(resolvedUnitCode) 
    : UNIT_AREA_DATA[resolvedUnitCode];

  const heatedFloorPrice = pricing.getHeatedFloorPrice();

  for (const selection of selections) {
    // Skip stair selections - they're handled separately as flat rates
    if (selection.areaId === 'stairs') {
      continue;
    }

    // Map areaId to the correct field in unitData
    const areaFieldMap: Record<string, string> = {
      'allLvp': 'allLvp',
      'mainLiving': 'mainLiving',
      'secondBedroom': 'secondBedroom',
      'masterBedroomLvp': 'masterBedroomLvp',
      'masterBedroom': 'masterBedroom',
      'secondBedroomCarpet': 'secondBedroomCarpet',
      'masterBedroomCarpet': 'masterBedroom', // Uses same field
      'guestBathroom': 'guestBathroom',
      'masterEnsuite': 'masterEnsuite',
      'laundry': 'laundry',
      'backsplash': 'backsplash',
    };
    
    const fieldName = areaFieldMap[selection.areaId] || selection.areaId;
    const quantity = unitData ? (unitData as any)[fieldName] || 0 : 0;
    
    // Get material cost from dynamic pricing
    const costPerUnit = pricing.getMaterialCost(selection.materialType);
    const material = UPGRADE_MATERIALS.find(m => m.id === selection.materialType);
    const baseCost = quantity * costPerUnit;
    const markedUpCost = baseCost * (1 + pricing.markupPercentage);
    
    // Check if this selection has heated floor (tile in bathroom areas)
    const hasHeatedFloor = selection.heatedFloor && (selection.materialType === 'tile' || selection.materialType === 'nonstandard_tile');
    const heatedFloorCost = hasHeatedFloor ? heatedFloorPrice : 0;
    
    const areaInfo = AREA_DEFINITIONS.find(a => a.id === selection.areaId);
    
    // Always add to line items if selection exists, even if cost is 0
    // This ensures items appear in PDF even when area data might be missing
    subtotal += markedUpCost + heatedFloorCost;
    lineItems.push({
      areaId: selection.areaId,
      areaName: areaInfo?.name || selection.areaId,
      quantity,
      unit: material?.unit === 'sqyd' ? 'sq yd' : 'sq ft',
      markedUpCost,
      heatedFloor: hasHeatedFloor,
      heatedFloorCost,
    });
  }

  const gst = subtotal * pricing.gstRate;
  const total = subtotal + gst;

  return { subtotal, gst, total, lineItems };
}

// Helper function to calculate grout price with dynamic pricing
function calculateGroutPrice(pricing: PdfPricingConfig): { baseCost: number; markedUpCost: number; gst: number; total: number } {
  const baseCost = pricing.getGroutColorFee();
  const markedUpCost = baseCost; // Flat fees don't get markup
  const gst = baseCost * pricing.gstRate;
  const total = baseCost + gst;
  return { baseCost, markedUpCost, gst, total };
}

const loadLogo = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = reject;
    img.src = '/images/bmd-logo.png';
  });
};

interface BuyerSelections {
  unitNumber: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  estimatedPossessionDate: string;
  hasStairs: boolean;
  lvpColour: string;
  spcTileColour: string;
  backsplashOrientation: string;
  stairCarpetColour: string;
  stairLvpUpgradeSelected?: boolean;
  stairPremiumCarpetSelected?: boolean;
  bedroomFlooringChoice: 'carpet' | 'lvp' | '';
  bedroomCarpetColour: string;
  bedroomLvpColour: string;
  bedroomLvpSameAsMain: boolean;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  automatedWindowsQty: number;
  windowComments: string;
  lvpComments?: string;
  spcTileComments?: string;
  salesComments?: string;
  upgradeComments?: string;
  upgradeInterestsNotes?: string;
  areaUpgrades: AreaUpgradeSelection[];
  upgradeFloorSelection: '1' | '2' | null;
  backsplashGrout: BacksplashGroutSelection;
  bathroomTileSelected: boolean;
  heatedFloorBathrooms: number;
  customTiledShower?: boolean;
  upgradeInterests: Record<string, boolean>;
}

// Options for PDF output
interface PdfOutputOptions {
  returnBase64?: boolean;
  saveToFile?: boolean;
}

export async function generateBuyerPreviewPDF(
  selections: BuyerSelections,
  unitTypeCode: string | null,
  pricingConfig?: PdfPricingConfig,
  outputOptions?: PdfOutputOptions
): Promise<string | void> {
  const { returnBase64 = false, saveToFile = true } = outputOptions || {};
  // Default pricing config if not provided (fallback to hardcoded values)
  const pricing = pricingConfig || {
    markupPercentage: 0.60,
    gstRate: 0.05,
    getMaterialCost: (type: string) => {
      const costs: Record<string, number> = { 
        lvp: 4.00, hardwood: 10.00, lvt: 4.00, carpet: 20.00, tile: 8.00,
        nonstandard_lvp: 2.50, nonstandard_lvt: 2.50, nonstandard_tile: 3.00
      };
      return costs[type] || 0;
    },
    getGroutColorFee: () => 300.00,
    getAdditionalWindowPrice: () => 673.50,
    getPatioDoorPrice: () => 2347.80,
    getAutomatedMotorPrice: () => 495.00,
    getHeatedFloorPrice: () => 1650.00,
    getStairLvpUpgradePrice: () => 2160.00,
    getStairCarpetUpgradePrice: () => 640.00,
  };
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Try to load logo
  let logoData: string | null = null;
  try {
    logoData = await loadLogo();
  } catch (e) {
    console.warn('Could not load logo:', e);
  }

  // Header with logo
  if (logoData) {
    doc.addImage(logoData, 'PNG', margin, yPos, 40, 20);
  }
  
  // Title
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.primary);
  doc.text('Selection Preview', pageWidth - margin, yPos + 12, { align: 'right' });
  
  yPos += 35;

  // Subtitle
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text('GLENDALE ESTATES', margin, yPos);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 15;

  // Divider
  doc.setDrawColor(...COLORS.secondary);
  doc.setLineWidth(0.5);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  
  yPos += 15;

  // Home Information Box
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 35, 3, 3, 'F');
  
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(`Unit ${selections.unitNumber}`, margin + 10, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${selections.firstName} ${selections.lastName}`.trim() || 'Buyer Name', margin + 10, yPos + 22);
  doc.text(selections.email || '', margin + 10, yPos + 30);
  
  if (selections.estimatedPossessionDate) {
    doc.setFont('helvetica', 'bold');
    doc.text('Est. Possession:', pageWidth / 2, yPos + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(selections.estimatedPossessionDate).toLocaleDateString(), pageWidth / 2, yPos + 22);
  }
  
  yPos += 50;

  // Standard Selections Section
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('Standard Selections (Included)', margin, yPos);
  yPos += 3;
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(2);
  doc.line(margin, yPos, margin + 50, yPos);
  yPos += 10;

  // Selections table
  const standardData: string[][] = [
    ['Main Floor LVP', lvpOptions.find(o => o.id === selections.lvpColour)?.name || 'Not selected'],
    ['Bathroom/Laundry Tile', spcTileOptions.find(o => o.id === selections.spcTileColour)?.name || 'Not selected'],
    ['Kitchen Backsplash', `${backsplashProduct.name} — ${selections.backsplashOrientation || 'Orientation not selected'}`],
    ['Bedroom Flooring', selections.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : (selections.bedroomFlooringChoice === 'carpet' ? 'Carpet' : 'Not selected')],
  ];

  if (selections.hasStairs) {
    if (selections.stairLvpUpgradeSelected) {
      const stairLvpPrice = pricing.getStairLvpUpgradePrice?.() || 2160;
      standardData.push(['Stair Flooring', `LVP Upgrade with Custom Nosings — $${stairLvpPrice.toLocaleString()} + GST`]);
    } else if (selections.stairPremiumCarpetSelected) {
      const stairCarpetPrice = pricing.getStairCarpetUpgradePrice?.() || 640;
      standardData.push(['Stair Flooring', `Premium Carpet Upgrade — $${stairCarpetPrice.toLocaleString()} + GST`]);
    } else {
      standardData.push(['Stair Flooring', selections.stairCarpetColour 
        ? carpetOptions.find(o => o.id === selections.stairCarpetColour)?.name || 'Standard Carpet (Included)'
        : 'Standard Carpet (Included)']);
    }
  }

  if (selections.bedroomFlooringChoice === 'carpet' && selections.bedroomCarpetColour) {
    standardData.push(['Bedroom Carpet Colour', carpetOptions.find(o => o.id === selections.bedroomCarpetColour)?.name || 'Not selected']);
  }

  if (selections.bedroomFlooringChoice === 'lvp') {
    const lvpColor = selections.bedroomLvpSameAsMain 
      ? `${lvpOptions.find(o => o.id === selections.lvpColour)?.name || 'Not selected'} (Same as Main)`
      : lvpOptions.find(o => o.id === selections.bedroomLvpColour)?.name || 'Not selected';
    standardData.push(['Bedroom LVP Colour', lvpColor]);
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'Selection']],
    body: standardData,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 10,
      textColor: COLORS.dark,
    },
    alternateRowStyles: {
      fillColor: COLORS.light,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
      1: { cellWidth: 'auto' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  // Check if we need a new page
  const checkNewPage = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - 30) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Window Coverings Section - Use dynamic pricing
  const additionalWindowPrice = pricing.getAdditionalWindowPrice();
  const patioDoorPrice = pricing.getPatioDoorPrice();
  const automatedMotorPrice = pricing.getAutomatedMotorPrice();
  
  const windowSubtotal = (selections.additionalWindowsQty * additionalWindowPrice) +
                        (selections.patioDoorsQty * patioDoorPrice) +
                        (selections.automatedWindowsQty * automatedMotorPrice);

  if (windowSubtotal > 0) {
    checkNewPage(70);
    
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Window Coverings', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 40, yPos);
    yPos += 10;

    const windowData: string[][] = [];
    
    if (selections.additionalWindowsQty > 0) {
      windowData.push([
        'Additional Windows',
        `${selections.additionalWindowsQty} × $${additionalWindowPrice.toFixed(2)}`,
        `$${(selections.additionalWindowsQty * additionalWindowPrice).toFixed(2)}`
      ]);
    }
    
    if (selections.patioDoorsQty > 0) {
      windowData.push([
        'Patio Door Panel Track',
        `${selections.patioDoorsQty} × $${patioDoorPrice.toFixed(2)}`,
        `$${(selections.patioDoorsQty * patioDoorPrice).toFixed(2)}`
      ]);
    }
    
    if (selections.automatedWindowsQty > 0) {
      windowData.push([
        'Somfy Automation',
        `${selections.automatedWindowsQty} × $${automatedMotorPrice.toFixed(2)}`,
        `$${(selections.automatedWindowsQty * automatedMotorPrice).toFixed(2)}`
      ]);
    }

    // Show only subtotal for this section - GST will be calculated once in grand total
    windowData.push(['', 'Section Subtotal:', `$${windowSubtotal.toFixed(2)}`]);

    autoTable(doc, {
      startY: yPos,
      body: windowData,
      margin: { left: margin, right: margin },
      bodyStyles: {
        fontSize: 10,
        textColor: COLORS.dark,
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 60, halign: 'right' },
        2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        // Highlight the last row (section subtotal)
        if (data.row.index === windowData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Upgrades Section
  const effectiveUnitCode = normalizeUnitTypeCode(unitTypeCode);
  
  // Calculate upgrade costs using dynamic pricing (includes heated floors per area)
  // Pass upgradeFloorSelection to resolve G/H unit codes to floor-specific versions
  const upgradeCalc = calculateUpgradeCost(effectiveUnitCode || '', selections.areaUpgrades, pricing, selections.upgradeFloorSelection);
  const groutPrice = selections.backsplashGrout?.enabled ? calculateGroutPrice(pricing) : null;
  
  // Stair LVP upgrade cost (from the stairLvpUpgradeSelected flag)
  const stairLvpPrice = selections.stairLvpUpgradeSelected ? (pricing.getStairLvpUpgradePrice?.() || 2160) : 0;
  
  // Stair Premium Carpet upgrade cost (from the stairPremiumCarpetSelected flag)
  const stairCarpetPrice = selections.stairPremiumCarpetSelected ? (pricing.getStairCarpetUpgradePrice?.() || 640) : 0;
  
  // Check if there's a stair selection in areaUpgrades (premium carpet from upgrade picker)
  const stairUpgradeFromPicker = selections.areaUpgrades.find(u => u.areaId === 'stairs');
  const stairUpgradePickerPrice = stairUpgradeFromPicker ? (pricing.getStairCarpetUpgradePrice?.() || 640) : 0;

  // ----- Section 4 bathroom upgrades (matches UpgradePricingSummary) -----
  const heatedFloorPerBathroom = pricing.getHeatedFloorPrice();

  // Porcelain Tile Floor Upgrade — area-based, marked up
  const bathroomTileSubtotal = (() => {
    if (!selections.bathroomTileSelected || !effectiveUnitCode) return 0;
    const tileCostPerSqft = pricing.getMaterialCost('tile' as MaterialType);
    if (tileCostPerSqft <= 0) return 0;
    const code = effectiveUnitCode.toUpperCase();
    let guestBathArea = 0;
    let ensuiteArea = 0;
    if (['G', 'H'].includes(code) && pricing.getUnitAreaData) {
      const d1 = pricing.getUnitAreaData(`${code}-1`);
      const d2 = pricing.getUnitAreaData(`${code}-2`);
      guestBathArea = Math.max(d1?.guestBathroom || 0, d2?.guestBathroom || 0);
      ensuiteArea = Math.max(d1?.masterEnsuite || 0, d2?.masterEnsuite || 0);
    } else if (pricing.getUnitAreaData) {
      const areaData = pricing.getUnitAreaData(code);
      guestBathArea = areaData?.guestBathroom || 0;
      ensuiteArea = areaData?.masterEnsuite || 0;
    }
    return (guestBathArea + ensuiteArea) * tileCostPerSqft * (1 + pricing.markupPercentage);
  })();

  // Heated Tile Floor (Section 4) — flat per bathroom
  const section4HeatedFloorSubtotal =
    (selections.heatedFloorBathrooms || 0) > 0
      ? selections.heatedFloorBathrooms * heatedFloorPerBathroom
      : 0;

  // Custom Tiled Shower — flat marked-up cost
  const customShowerCost = pricing.getMaterialCost('tiled_shower' as MaterialType);
  const customShowerSubtotal = selections.customTiledShower
    ? customShowerCost * (1 + pricing.markupPercentage)
    : 0;

  // Note: heated floor costs are now included in upgradeCalc.subtotal per area
  // Include stair upgrade picker price only if not already counted via stairCarpetPrice flag
  const upgradesSubtotal = upgradeCalc.subtotal + (groutPrice?.markedUpCost || 0) + stairLvpPrice + 
    (stairCarpetPrice > 0 ? stairCarpetPrice : stairUpgradePickerPrice) +
    bathroomTileSubtotal + section4HeatedFloorSubtotal + customShowerSubtotal;

  if (upgradesSubtotal > 0) {
    checkNewPage(80);
    
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Premium Upgrades', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 40, yPos);
    yPos += 10;

    const upgradeData: string[][] = [];

    // Area upgrades - show material names, heated floor, and prices using line items
    // The lineItems now include areaId for reliable matching
    selections.areaUpgrades.forEach(upgrade => {
      // Skip stair selections - they're handled separately below
      if (upgrade.areaId === 'stairs') return;
      
      const areaDef = AREA_DEFINITIONS.find(a => a.id === upgrade.areaId);
      if (areaDef) {
        // Find the matching line item by areaId (more reliable than areaName)
        const itemCalc = upgradeCalc.lineItems.find(i => i.areaId === upgrade.areaId);
        const materialCost = itemCalc?.markedUpCost || 0;
        
        // Add the material upgrade line
        upgradeData.push([
          `${areaDef.name} — ${upgrade.productName || UPGRADE_MATERIALS.find(m => m.id === upgrade.materialType)?.name || upgrade.materialType}`,
          `$${materialCost.toFixed(2)}`
        ]);
        
        // Add heated floor line if applicable
        if (itemCalc?.heatedFloor && itemCalc.heatedFloorCost) {
          upgradeData.push([
            `  └ Heated Floor (${areaDef.name})`,
            `$${itemCalc.heatedFloorCost.toFixed(2)}`
          ]);
        }
      }
    });
    
    // Handle stair selections from areaUpgrades (premium carpet selections)
    const stairUpgrade = selections.areaUpgrades.find(u => u.areaId === 'stairs');
    
    // Stair LVP upgrade (from stairLvpUpgradeSelected flag)
    if (stairLvpPrice > 0) {
      upgradeData.push([
        'Stair LVP Upgrade with Custom Nosings',
        `$${stairLvpPrice.toFixed(2)}`
      ]);
    }
    // Stair Premium Carpet upgrade (from stairPremiumCarpetSelected flag) - only if no areaUpgrades stair
    else if (stairCarpetPrice > 0 && !stairUpgrade) {
      upgradeData.push([
        'Premium Carpet Stairs Upgrade',
        `$${stairCarpetPrice.toFixed(2)}`
      ]);
    }
    // Stair selection from upgrade picker (premium carpet with product name)
    else if (stairUpgrade) {
      const stairCarpetUpgradePrice = pricing.getStairCarpetUpgradePrice?.() || 640;
      upgradeData.push([
        `Stairs — ${stairUpgrade.productName || UPGRADE_MATERIALS.find(m => m.id === stairUpgrade.materialType)?.name || 'Premium Carpet'}`,
        `$${stairCarpetUpgradePrice.toFixed(2)}`
      ]);
    }

    // Grout color change
    if (groutPrice) {
      upgradeData.push([
        `Backsplash Grout Color Change${selections.backsplashGrout.groutColor ? ` — ${selections.backsplashGrout.groutColor}` : ''}`,
        `$${groutPrice.markedUpCost.toFixed(2)}`
      ]);
    }

    // Show only section subtotal - GST will be calculated once in grand total
    upgradeData.push(['Section Subtotal:', `$${upgradesSubtotal.toFixed(2)}`]);

    autoTable(doc, {
      startY: yPos,
      body: upgradeData,
      margin: { left: margin, right: margin },
      bodyStyles: {
        fontSize: 10,
        textColor: COLORS.dark,
      },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        // Highlight the last row (section subtotal)
        if (data.row.index === upgradeData.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Upgrade Interests
  const interests = Object.entries(selections.upgradeInterests)
    .filter(([_, v]) => v)
    .map(([key]) => key.replace('-', ' '));

  if (interests.length > 0) {
    checkNewPage(50);
    
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Upgrade Interests', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 40, yPos);
    yPos += 12;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.dark);
    
    interests.forEach((interest, i) => {
      doc.text(`• ${interest.charAt(0).toUpperCase() + interest.slice(1)}`, margin, yPos + (i * 7));
    });
    
    yPos += interests.length * 7 + 10;
    doc.setTextColor(...COLORS.muted);
    doc.text('Our team will contact you with details and pricing for these options.', margin, yPos);
    yPos += 15;
  }

  // Grand Total - Consolidated summary of all upgrades
  // Use individual subtotals to calculate GST once (not per-section totals which already include GST)
  const grandSubtotal = windowSubtotal + upgradesSubtotal;
  const grandGst = grandSubtotal * pricing.gstRate;
  const grandTotal = grandSubtotal + grandGst;
  
  // Note: The section totals (Window Coverings and Premium Upgrades) each show their own GST.
  // The Grand Total shows the combined subtotal with a single GST calculation.
  // This is correct - we're applying GST once to the total, not re-applying to section totals.
  
  if (grandTotal > 0) {
    checkNewPage(60);
    
    // Summary box header
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Complete Upgrade Summary', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 55, yPos);
    yPos += 12;
    
    // Summary breakdown
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    
    if (windowSubtotal > 0) {
      doc.text('Window Coverings:', margin, yPos);
      doc.text(`$${windowSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;
    }
    
    if (upgradesSubtotal > 0) {
      doc.text('Premium Upgrades:', margin, yPos);
      doc.text(`$${upgradesSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;
    }
    
    // Totals
    yPos += 5;
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;
    
    doc.text('Subtotal (pre-GST):', margin, yPos);
    doc.text(`$${grandSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;
    
    doc.text(`GST (${(pricing.gstRate * 100).toFixed(0)}%):`, margin, yPos);
    doc.text(`$${grandGst.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 12;
    
    // Grand total highlight box
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'F');
    
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Grand Total (incl. GST):', margin + 10, yPos + 16);
    doc.setFontSize(18);
    doc.text(`$${grandTotal.toFixed(2)}`, pageWidth - margin - 10, yPos + 16, { align: 'right' });
    
    yPos += 35;
    
    // Material overage note
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'italic');
    doc.text('* A 10% material overage is allowed on all quoted amounts.', margin, yPos);
  }

  // ===== Buyer Comments & Notes =====
  const commentEntries: Array<{ label: string; text: string }> = [];
  if (selections.lvpComments) commentEntries.push({ label: 'Main Floor LVP', text: selections.lvpComments });
  if (selections.spcTileComments) commentEntries.push({ label: 'Bathroom Tile', text: selections.spcTileComments });
  if (selections.windowComments) commentEntries.push({ label: 'Window Coverings', text: selections.windowComments });
  if (selections.backsplashGrout?.comments) commentEntries.push({ label: 'Backsplash Grout', text: selections.backsplashGrout.comments });
  if (selections.upgradeInterestsNotes) commentEntries.push({ label: 'Upgrade Interests', text: selections.upgradeInterestsNotes });
  if (selections.upgradeComments) commentEntries.push({ label: 'Upgrade Pricing Summary', text: selections.upgradeComments });
  // Per-area upgrade comments — render every comment, even when the area
  // identifier is missing or a placeholder, so the buyer's note is preserved.
  (selections.areaUpgrades || []).forEach((u, idx) => {
    if (!u.comments) return;
    const areaDef = AREA_DEFINITIONS.find(a => a.id === u.areaId);
    let label: string;
    if (areaDef) {
      label = `Area Upgrade — ${areaDef.name}`;
    } else if (!u.areaId || u.areaId.startsWith('unspecified_area')) {
      label = `Area Upgrade — Unspecified Area #${idx + 1}`;
    } else {
      label = `Area Upgrade — ${u.areaId}`;
    }
    commentEntries.push({ label, text: u.comments });
  });

  if (commentEntries.length > 0) {
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = margin;
    } else {
      yPos += 10;
    }

    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Your Comments & Notes', margin, yPos);
    yPos += 3;
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 50, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    commentEntries.forEach(entry => {
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.dark);
      doc.text(`${entry.label}:`, margin, yPos);
      yPos += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.muted);
      const wrapped = doc.splitTextToSize(entry.text, pageWidth - margin * 2);
      doc.text(wrapped, margin, yPos);
      yPos += wrapped.length * 5 + 4;
    });
  }

  // Footer
  const footerY = pageHeight - 20;
  doc.setDrawColor(...COLORS.secondary);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text('BMD Materials | Glendale Estates Selection Portal', margin, footerY);
  doc.text('PREVIEW — Not a final submission', pageWidth - margin, footerY, { align: 'right' });

  // Handle output based on options
  const fileName = `Unit-${selections.unitNumber || 'Preview'}-Selections.pdf`;
  
  if (saveToFile) {
    doc.save(fileName);
  }
  
  if (returnBase64) {
    // Return base64 string (without data URL prefix)
    const pdfOutput = doc.output('datauristring');
    // Extract just the base64 part
    const base64 = pdfOutput.split(',')[1];
    return base64;
  }
}
