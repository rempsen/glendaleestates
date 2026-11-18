import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  lvpOptions, 
  spcTileOptions, 
  carpetOptions, 
  backsplashProduct,
  backsplashOrientations,
  resolveOptionName,
} from "@/lib/mockData";
import { 
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  normalizeUnitTypeCode,
  AREA_DEFINITIONS,
  UNIT_AREA_DATA,
  UPGRADE_MATERIALS,
  MaterialType,
} from '@/lib/upgradeCostData';
import { BATHROOM_TILE_LABEL, LAUNDRY_ROW_LABEL, laundryValue, PRIMARY_BEDROOM_FLOORING_LABEL, PRIMARY_BEDROOM_CARPET_COLOUR_LABEL, STAIR_CARPET_LABEL, STAIR_STANDARD_VALUE, toBuyerWording } from '@/lib/outputLabels';
import { clientAreaNotes, type AreaNote } from '@/lib/areaNotes';
import { computeUpgradeTotals, parseCustomPricing, LINE_STATUS_LABELS, type CustomPricing } from '@/lib/upgradeTotals';

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
  [key: string]: number | undefined;
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
  getStairPremiumLvpUpgradePrice?: () => number;
  getStairCarpetUpgradePrice?: () => number;
  getStairUnderpadUpgradePrice?: () => number;
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

export interface BuyerSelections {
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
  bathroomTileEnsuiteSelected?: boolean;
  bathroomTileGuestSelected?: boolean;
  heatedFloorBathrooms: number;
  customTiledShower?: boolean;
  customPricing?: CustomPricing | null;
  stairUpgradeType?: 'standard' | 'lvp' | 'premium_lvp' | string;
  premiumCarpetBedroom?: boolean;
  premiumUnderpadBedroom?: boolean;
  premiumUnderpadStairs?: boolean;
  hardwoodUpgradeSelected?: boolean;
  documentCount?: number;
  documentUploads?: unknown[];
  upgradeInterests: Record<string, boolean>;
}

// Options for PDF output
interface PdfOutputOptions {
  returnBase64?: boolean;
  saveToFile?: boolean;
  /** Staff-only copy: adds an Office Record section with internal notes. Never set for buyer-facing PDFs. */
  staffRecord?: { submittedAt?: string | null; status?: string | null; adminNotes?: string | null; salesComments?: string | null; areaInternalNotes?: AreaNote[] };
  footerLabel?: string;
}

/**
 * Standard Selections table rows (label/value pairs) shared by the buyer PDF and the Word export.
 * Buyer-facing wording follows the base specification; see src/lib/outputLabels.ts.
 */
export function buildStandardSelectionRows(
  selections: BuyerSelections,
  pricing: PdfPricingConfig,
  totals: ReturnType<typeof computeUpgradeTotals>,
): string[][] {
  const cpInfo = parseCustomPricing(selections.customPricing);
  const prov = (field: string) => (cpInfo.provisional?.[field] || '').trim();
  const standardData: string[][] = [
    ['Main Floor LVP', `${resolveOptionName(lvpOptions, selections.lvpColour) || 'Not selected'}${prov('lvp_colour') ? ` (PROVISIONAL — ${prov('lvp_colour')})` : ''}`],
    [BATHROOM_TILE_LABEL, resolveOptionName(spcTileOptions, selections.spcTileColour) || 'Not selected'],
    [LAUNDRY_ROW_LABEL, laundryValue(selections.areaUpgrades)],
    ['Kitchen Backsplash', `${backsplashProduct.name} — ${resolveOptionName(backsplashOrientations, selections.backsplashOrientation) || 'Orientation not selected'}`],
    ['Phone', selections.phoneNumber || 'Not provided'],
    ...(selections.upgradeFloorSelection ? [['Upgrade Floor', `Floor ${selections.upgradeFloorSelection}`]] : []),
    [PRIMARY_BEDROOM_FLOORING_LABEL, selections.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : (selections.bedroomFlooringChoice === 'carpet' ? 'Carpet' : 'Not selected')],
  ];

  (totals.pieces.includedItems || []).forEach(i => standardData.push([toBuyerWording([i.area, i.label].filter(Boolean).join(' — ')), 'Included — $0.00']));

  if (selections.hasStairs) {
    const stairColour = selections.stairCarpetColour ? resolveOptionName(carpetOptions, selections.stairCarpetColour) : '';
    if (selections.stairUpgradeType === 'lvp' || selections.stairUpgradeType === 'premium_lvp' || selections.stairLvpUpgradeSelected) {
      const stairLvpPrice = (selections.stairUpgradeType === 'premium_lvp' ? pricing.getStairPremiumLvpUpgradePrice?.() : undefined) || pricing.getStairLvpUpgradePrice?.() || 2160;
      standardData.push(['Stair Flooring', `${selections.stairUpgradeType === 'premium_lvp' ? 'Premium ' : ''}LVP Upgrade with Custom Nosings — $${stairLvpPrice.toLocaleString()} + GST`]);
    } else if (selections.stairPremiumCarpetSelected) {
      const stairCarpetPrice = pricing.getStairCarpetUpgradePrice?.() || 640;
      standardData.push([STAIR_CARPET_LABEL, `Premium Carpet Upgrade${stairColour ? ` (${stairColour})` : ''} — $${stairCarpetPrice.toLocaleString()} + GST`]);
    } else if (selections.premiumUnderpadStairs) {
      // Underpad upgrade on standard carpet: keep the chosen colour as the carpet value; the underpad has its own row.
      standardData.push([STAIR_CARPET_LABEL, stairColour || STAIR_STANDARD_VALUE]);
    } else {
      standardData.push([STAIR_CARPET_LABEL, stairColour ? `${STAIR_STANDARD_VALUE} — ${stairColour}` : STAIR_STANDARD_VALUE]);
    }
  }

  if (selections.bedroomFlooringChoice === 'carpet' && selections.bedroomCarpetColour) {
    standardData.push([PRIMARY_BEDROOM_CARPET_COLOUR_LABEL, resolveOptionName(carpetOptions, selections.bedroomCarpetColour) || 'Not selected']);
  }

  if (selections.bedroomFlooringChoice === 'lvp') {
    const lvpColor = selections.bedroomLvpSameAsMain 
      ? `${resolveOptionName(lvpOptions, selections.lvpColour) || 'Not selected'} (Same as Main)`
      : resolveOptionName(lvpOptions, selections.bedroomLvpColour) || 'Not selected';
    standardData.push(['Primary Bedroom LVP Colour', lvpColor]);
  }

  // Additional selections captured in the wizard / admin editor
  if (selections.hasStairs && selections.premiumUnderpadStairs) standardData.push(['Premium Underpad (Stairs)', 'Selected']);
  if (selections.hardwoodUpgradeSelected) standardData.push(['Hardwood Upgrade', 'Interested']);
  const docCount = selections.documentCount ?? (Array.isArray(selections.documentUploads) ? selections.documentUploads.length : 0);
  if (docCount > 0) standardData.push(['Documents Uploaded', `${docCount} file${docCount > 1 ? 's' : ''} on record`]);
  return standardData;
}

export async function generateBuyerPreviewPDF(
  selections: BuyerSelections,
  unitTypeCode: string | null,
  pricingConfig?: PdfPricingConfig,
  outputOptions?: PdfOutputOptions
): Promise<string | void> {
  const { returnBase64 = false, saveToFile = true, staffRecord, footerLabel } = outputOptions || {};
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

  // Single source of truth for upgrade totals — matches on-screen UI 1:1
  const totals = computeUpgradeTotals(totalsInputFromSelections(selections, unitTypeCode), pricing);

  // Selections table
  const cpInfo = parseCustomPricing(selections.customPricing);
  const standardData = buildStandardSelectionRows(selections, pricing, totals);

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

  // ====================================================================
  // Single source of truth for upgrade totals — matches on-screen UI 1:1
  // ====================================================================

  console.log('[buyerPdfGenerator] computed totals:', {
    windowSubtotal: totals.windowSubtotal,
    upgradesSubtotal: totals.upgradesSubtotal,
    grandTotal: totals.grandTotal,
    bathroomTile: totals.pieces.bathroomTile,
    section4HeatedFloor: totals.pieces.section4HeatedFloor,
    customShower: totals.pieces.customShower,
    inputs: {
      bathroomTileSelected: selections.bathroomTileSelected,
      heatedFloorBathrooms: selections.heatedFloorBathrooms,
      customTiledShower: selections.customTiledShower,
      customPricing: selections.customPricing,
    },
  });

  const additionalWindowPrice = pricing.getAdditionalWindowPrice();
  const patioDoorPrice = pricing.getPatioDoorPrice();
  const automatedMotorPrice = pricing.getAutomatedMotorPrice();

  // ---- Window Coverings table ----
  if (totals.windowSubtotal > 0) {
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
      windowData.push(['Additional Windows', `${selections.additionalWindowsQty} × $${additionalWindowPrice.toFixed(2)}`, `$${totals.pieces.windowAdditional.toFixed(2)}`]);
    }
    if (selections.patioDoorsQty > 0) {
      windowData.push(['Patio Door Panel Track', `${selections.patioDoorsQty} × $${patioDoorPrice.toFixed(2)}`, `$${totals.pieces.windowPatio.toFixed(2)}`]);
    }
    if (selections.automatedWindowsQty > 0) {
      windowData.push(['Somfy Automation', `${selections.automatedWindowsQty} × $${automatedMotorPrice.toFixed(2)}`, `$${totals.pieces.windowAutomation.toFixed(2)}`]);
    }
    windowData.push(['', 'Section Subtotal:', `$${totals.windowSubtotal.toFixed(2)}`]);

    autoTable(doc, {
      startY: yPos,
      body: windowData,
      margin: { left: margin, right: margin },
      bodyStyles: { fontSize: 10, textColor: COLORS.dark },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 60, halign: 'right' },
        2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === windowData.length - 1) data.cell.styles.fontStyle = 'bold';
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // ---- Premium Upgrades table ----
  if (totals.upgradesSubtotal > 0) {
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

    if (totals.pieces.stairLvp > 0) {
      upgradeData.push([totals.pieces.labels.stair || (selections.stairUpgradeType === 'premium_lvp' ? 'Stair Premium LVP Upgrade with Custom Nosings' : 'Stair LVP Upgrade with Custom Nosings'), `$${totals.pieces.stairLvp.toFixed(2)}`]);
    }
    if (totals.pieces.stairCarpet > 0) {
      upgradeData.push([totals.pieces.labels.stairCarpet || 'Premium Carpet — Stairs to Lower Level', `$${totals.pieces.stairCarpet.toFixed(2)}`]);
    }
    if (totals.pieces.stairUnderpad > 0) {
      upgradeData.push([totals.pieces.labels.stairUnderpad || 'Premium Underpad — Stairs to Lower Level', `$${totals.pieces.stairUnderpad.toFixed(2)}`]);
    }

    totals.pieces.flooringUpgrades.forEach(item => {
      const productLine = [item.materialName, item.productName, item.productColor]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(' — ');
      upgradeData.push([toBuyerWording(`${item.areaName} — ${productLine}`), `$${item.amount.toFixed(2)}`]);
      if (item.heatedFloorAmount > 0) {
        upgradeData.push([toBuyerWording(`  └ Heated Floor (${item.areaName})`), `$${item.heatedFloorAmount.toFixed(2)}`]);
      }
    });

    if (totals.pieces.bathroomTile > 0) {
      const bathrooms = [
        selections.bathroomTileEnsuiteSelected && 'Ensuite',
        selections.bathroomTileGuestSelected && 'Guest Bathroom',
      ].filter(Boolean).join(', ');
      upgradeData.push([totals.pieces.labels.bathroomTile || `Porcelain Tile Floor Upgrade${bathrooms ? ` — ${bathrooms}` : ''}`, `$${totals.pieces.bathroomTile.toFixed(2)}`]);
    }
    if (totals.pieces.section4HeatedFloor > 0) {
      const n = selections.heatedFloorBathrooms || 0;
      const heatedFloorPerBathroom = pricing.getHeatedFloorPrice();
      upgradeData.push([
        totals.pieces.labels.heatedFloor || `Heated Tile Floor (${n} bathroom${n > 1 ? 's' : ''} × $${heatedFloorPerBathroom.toLocaleString()})`,
        `$${totals.pieces.section4HeatedFloor.toFixed(2)}`,
      ]);
    }
    if (totals.pieces.customShower > 0) {
      upgradeData.push([totals.pieces.labels.customShower || 'Custom Tiled Shower', `$${totals.pieces.customShower.toFixed(2)}`]);
    }

    if (totals.pieces.grout > 0) {
      upgradeData.push([
        totals.pieces.labels.grout || `Backsplash Grout Color Change${selections.backsplashGrout?.groutColor ? ` — ${selections.backsplashGrout.groutColor}` : ''}`,
        `$${totals.pieces.grout.toFixed(2)}`,
      ]);
    }

    totals.pieces.customItems.forEach(item => {
      upgradeData.push([item.detail ? `${item.label} — ${item.detail}` : item.label, `$${item.amount.toFixed(2)}`]);
    });

    upgradeData.push(['Section Subtotal:', `$${totals.upgradesSubtotal.toFixed(2)}`]);

    autoTable(doc, {
      startY: yPos,
      body: upgradeData,
      margin: { left: margin, right: margin },
      bodyStyles: { fontSize: 10, textColor: COLORS.dark },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.row.index === upgradeData.length - 1) data.cell.styles.fontStyle = 'bold';
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Office lines not in the total: included, pending price, under review, deferred
  const uncommitted = totals.pieces.uncommittedItems || [];
  const openItems = (cpInfo.followUps || []).filter(f => f.clientVisible && !f.done && f.text?.trim());
  if (uncommitted.length > 0 || openItems.length > 0) {
    if (yPos > pageHeight - 70) { doc.addPage(); yPos = 25; }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLORS.dark);
    doc.text('Not Included in Total', margin, yPos);
    yPos += 6;
    const rows: string[][] = uncommitted.map(u => [
      [u.area, u.label, u.detail].filter(Boolean).join(' — '),
      LINE_STATUS_LABELS[u.status] || u.status,
      u.amount === null ? 'Pending' : `$${u.amount.toFixed(2)}`,
    ]);
    openItems.forEach(f => rows.push([f.text.trim(), 'Open question', '—']));
    autoTable(doc, {
      startY: yPos, body: rows, margin: { left: margin, right: margin },
      bodyStyles: { fontSize: 9, textColor: COLORS.dark },
      columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 35 }, 2: { cellWidth: 30, halign: 'right' } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 4;
    doc.setFontSize(8); doc.setFont('helvetica', 'italic');
    doc.text('Items marked Pending, Under review or Deferred are not yet priced or approved and are not part of the total above.', margin, yPos + 4);
    yPos += 14;
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

  // ---- Grand Total summary ----
  if (totals.grandTotal > 0) {
    checkNewPage(60);

    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Complete Upgrade Summary', margin, yPos);
    yPos += 3;

    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 55, yPos);
    yPos += 12;

    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');

    if (totals.windowSubtotal > 0) {
      doc.text('Window Coverings:', margin, yPos);
      doc.text(`$${totals.windowSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;
    }
    if (totals.upgradesSubtotal > 0) {
      doc.text('Premium Upgrades:', margin, yPos);
      doc.text(`$${totals.upgradesSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;
    }

    yPos += 5;
    doc.setDrawColor(...COLORS.muted);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    doc.text('Subtotal (pre-GST):', margin, yPos);
    doc.text(`$${totals.grandSubtotal.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 8;

    doc.text(`GST (${(pricing.gstRate * 100).toFixed(0)}%):`, margin, yPos);
    doc.text(`$${totals.gst.toFixed(2)}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 12;

    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'F');

    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Grand Total (incl. GST):', margin + 10, yPos + 16);
    doc.setFontSize(18);
    doc.text(`$${totals.grandTotal.toFixed(2)}`, pageWidth - margin - 10, yPos + 16, { align: 'right' });

    yPos += 35;

    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.setFont('helvetica', 'italic');
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
  const areaNoteLabel = (u: { areaId: string }, idx: number) => {
    const areaDef = AREA_DEFINITIONS.find(a => a.id === u.areaId);
    let label: string;
    if (areaDef) {
      label = `Area Upgrade — ${toBuyerWording(areaDef.name)}`;
    } else if (!u.areaId || u.areaId.startsWith('unspecified_area')) {
      label = `Area Upgrade — Unspecified Area #${idx + 1}`;
    } else {
      label = `Area Upgrade — ${u.areaId}`;
    }
    return label;
  };
  clientAreaNotes(selections.areaUpgrades).forEach(n => {
    commentEntries.push({ label: areaNoteLabel(n, n.index), text: n.text });
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

    // AutoTable splits even a single long note across pages; raw doc.text did
    // not, so long comments could be printed below the page and disappear.
    autoTable(doc, {
      startY: yPos,
      body: commentEntries.map(entry => [entry.label, entry.text]),
      margin: { left: margin, right: margin, bottom: 30 },
      bodyStyles: { fontSize: 10, textColor: COLORS.dark },
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
    });
  }

  if (staffRecord) {
    const y0 = (doc as any).lastAutoTable?.finalY ?? yPos;
    yPos = y0 > pageHeight - 80 ? (doc.addPage(), margin) : y0 + 10;
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Office Record (Internal — Staff Only)', margin, yPos);
    yPos += 8;
    const rows: string[][] = [
      ['Submitted', staffRecord.submittedAt ? new Date(staffRecord.submittedAt).toLocaleString('en-CA') : '—'],
      ['Status', staffRecord.status || '—'],
      ['Admin Notes', staffRecord.salesComments?.trim() || '—'],
    ];
    if (staffRecord.adminNotes?.trim()) rows.push(['Internal Notes', staffRecord.adminNotes.trim()]);
    // Internal area notes (legacy `comments`): staff outputs only, labelled.
    (staffRecord.areaInternalNotes || []).forEach(n =>
      rows.push([`${areaNoteLabel(n, n.index).replace('Area Upgrade — ', '')} (internal note)`, n.text]));
    autoTable(doc, {
      startY: yPos, body: rows,
      margin: { left: margin, right: margin, bottom: 30 },
      bodyStyles: { fontSize: 10, textColor: COLORS.dark },
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
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
  doc.text(footerLabel || 'PREVIEW — Not a final submission', pageWidth - margin, footerY, { align: 'right' });

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

/** Shared by PDF and Word exports so their totals always match. */
export function totalsInputFromSelections(selections: BuyerSelections, unitTypeCode: string | null) {
  return {
    unitTypeCode,
    upgradeFloorSelection: selections.upgradeFloorSelection,
    areaUpgrades: selections.areaUpgrades || [],
    backsplashGrout: selections.backsplashGrout,
    stairLvpUpgradeSelected: selections.stairLvpUpgradeSelected,
    stairUpgradeType: selections.stairUpgradeType,
    stairPremiumCarpetSelected: selections.stairPremiumCarpetSelected,
    stairPremiumUnderpadSelected: selections.premiumUnderpadStairs,
    bedroomFlooringChoice: selections.bedroomFlooringChoice,
    bedroomPremiumCarpetSelected: selections.premiumCarpetBedroom,
    bedroomPremiumUnderpadSelected: selections.premiumUnderpadBedroom,
    additionalWindowsQty: selections.additionalWindowsQty,
    patioDoorsQty: selections.patioDoorsQty,
    automatedWindowsQty: selections.automatedWindowsQty,
    bathroomTileSelected: selections.bathroomTileSelected,
    bathroomTileEnsuiteSelected: selections.bathroomTileEnsuiteSelected,
    bathroomTileGuestSelected: selections.bathroomTileGuestSelected,
    heatedFloorBathrooms: selections.heatedFloorBathrooms,
    customTiledShower: selections.customTiledShower,
    customPricing: selections.customPricing,
    };
}
