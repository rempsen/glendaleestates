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
}

// BMD brand colors
const COLORS = {
  primary: [45, 70, 60] as [number, number, number],
  secondary: [180, 140, 130] as [number, number, number],
  dark: [40, 40, 40] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  light: [245, 243, 240] as [number, number, number],
};

// Helper function to calculate upgrade cost with dynamic pricing
function calculateUpgradeCost(
  unitTypeCode: string,
  selections: AreaUpgradeSelection[],
  pricing: PdfPricingConfig
): { subtotal: number; gst: number; total: number; lineItems: Array<{ areaName: string; quantity: number; unit: string; markedUpCost: number }> } {
  let subtotal = 0;
  const lineItems: Array<{ areaName: string; quantity: number; unit: string; markedUpCost: number }> = [];

  const unitData = UNIT_AREA_DATA[unitTypeCode];
  if (!unitData) {
    return { subtotal: 0, gst: 0, total: 0, lineItems: [] };
  }

  for (const selection of selections) {
    const quantity = unitData[selection.areaId] || 0;
    if (quantity === 0) continue;

    const costPerUnit = pricing.getMaterialCost(selection.materialType);
    const material = UPGRADE_MATERIALS.find(m => m.id === selection.materialType);
    const baseCost = quantity * costPerUnit;
    const markedUpCost = baseCost * (1 + pricing.markupPercentage);
    
    if (markedUpCost > 0) {
      subtotal += markedUpCost;
      const areaInfo = AREA_DEFINITIONS.find(a => a.id === selection.areaId);
      lineItems.push({
        areaName: areaInfo?.name || selection.areaId,
        quantity,
        unit: material?.unit === 'sqyd' ? 'sq yd' : 'sq ft',
        markedUpCost,
      });
    }
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
  bedroomFlooringChoice: 'carpet' | 'lvp' | '';
  bedroomCarpetColour: string;
  bedroomLvpColour: string;
  bedroomLvpSameAsMain: boolean;
  additionalWindowsQty: number;
  patioDoorsQty: number;
  automatedWindowsQty: number;
  windowComments: string;
  areaUpgrades: AreaUpgradeSelection[];
  upgradeFloorSelection: '1' | '2' | null;
  backsplashGrout: BacksplashGroutSelection;
  bathroomTileSelected: boolean;
  heatedFloorBathrooms: number;
  upgradeInterests: Record<string, boolean>;
}

export async function generateBuyerPreviewPDF(
  selections: BuyerSelections,
  unitTypeCode: string | null,
  pricingConfig?: PdfPricingConfig
): Promise<void> {
  // Default pricing config if not provided (fallback to hardcoded values)
  const pricing = pricingConfig || {
    markupPercentage: 0.60,
    gstRate: 0.05,
    getMaterialCost: (type: 'lvp' | 'hardwood' | 'carpet' | 'tile') => {
      const costs = { lvp: 4.00, hardwood: 10.00, carpet: 20.00, tile: 8.00 };
      return costs[type];
    },
    getGroutColorFee: () => 300.00,
    getAdditionalWindowPrice: () => 673.50,
    getPatioDoorPrice: () => 2347.80,
    getAutomatedMotorPrice: () => 495.00,
    getHeatedFloorPrice: () => 1650.00,
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
    standardData.push(['Stairs Carpet', carpetOptions.find(o => o.id === selections.stairCarpetColour)?.name || 'Not selected']);
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

    const windowGst = windowSubtotal * pricing.gstRate;
    const windowTotal = windowSubtotal + windowGst;

    windowData.push(['', 'Subtotal:', `$${windowSubtotal.toFixed(2)}`]);
    windowData.push(['', `GST (${(pricing.gstRate * 100).toFixed(0)}%):`, `$${windowGst.toFixed(2)}`]);
    windowData.push(['', 'Total:', `$${windowTotal.toFixed(2)}`]);

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
        if (data.row.index >= windowData.length - 3) {
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.row.index === windowData.length - 1) {
          data.cell.styles.textColor = COLORS.primary;
          data.cell.styles.fontSize = 12;
        }
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Upgrades Section
  const effectiveUnitCode = normalizeUnitTypeCode(unitTypeCode);
  
  // Calculate upgrade costs using dynamic pricing
  const upgradeCalc = calculateUpgradeCost(effectiveUnitCode || '', selections.areaUpgrades, pricing);
  const heatedFloorPerBathroom = pricing.getHeatedFloorPrice();
  const heatedFloorSubtotal = selections.bathroomTileSelected || selections.areaUpgrades.some(s => ['guestBathroom', 'masterEnsuite'].includes(s.areaId))
    ? selections.heatedFloorBathrooms * heatedFloorPerBathroom
    : 0;
  const groutPrice = selections.backsplashGrout?.enabled ? calculateGroutPrice(pricing) : null;
  
  const upgradesSubtotal = upgradeCalc.subtotal + heatedFloorSubtotal + (groutPrice?.markedUpCost || 0);

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

    // Area upgrades - show only material names and prices (no sq ft)
    selections.areaUpgrades.forEach(upgrade => {
      const areaDef = AREA_DEFINITIONS.find(a => a.id === upgrade.areaId);
      if (areaDef) {
        const itemCalc = upgradeCalc.lineItems.find(i => i.areaName === areaDef.name);
        upgradeData.push([
          `${areaDef.name} — ${upgrade.productName}`,
          `$${itemCalc?.markedUpCost.toFixed(2) || '0.00'}`
        ]);
      }
    });

    // Heated floors
    if (heatedFloorSubtotal > 0) {
      upgradeData.push([
        `Heated Bathroom Floors (${selections.heatedFloorBathrooms} bathroom${selections.heatedFloorBathrooms > 1 ? 's' : ''})`,
        `$${heatedFloorSubtotal.toFixed(2)}`
      ]);
    }

    // Grout color change
    if (groutPrice) {
      upgradeData.push([
        `Backsplash Grout Color Change${selections.backsplashGrout.groutColor ? ` — ${selections.backsplashGrout.groutColor}` : ''}`,
        `$${groutPrice.markedUpCost.toFixed(2)}`
      ]);
    }

    const upgradesGst = upgradesSubtotal * pricing.gstRate;
    const upgradesTotalWithGst = upgradesSubtotal + upgradesGst;

    upgradeData.push(['Subtotal:', `$${upgradesSubtotal.toFixed(2)}`]);
    upgradeData.push([`GST (${(pricing.gstRate * 100).toFixed(0)}%):`, `$${upgradesGst.toFixed(2)}`]);
    upgradeData.push(['Total:', `$${upgradesTotalWithGst.toFixed(2)}`]);

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
        if (data.row.index >= upgradeData.length - 3) {
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.row.index === upgradeData.length - 1) {
          data.cell.styles.textColor = COLORS.primary;
          data.cell.styles.fontSize = 12;
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

  // Grand Total
  const grandTotal = windowSubtotal * (1 + pricing.gstRate) + upgradesSubtotal * (1 + pricing.gstRate);
  
  if (grandTotal > 0) {
    checkNewPage(40);
    
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'F');
    
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Estimated Grand Total (including GST):', margin + 10, yPos + 16);
    doc.setFontSize(18);
    doc.text(`$${grandTotal.toFixed(2)}`, pageWidth - margin - 10, yPos + 16, { align: 'right' });
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

  // Save the PDF
  const fileName = `Unit-${selections.unitNumber || 'Preview'}-Selections.pdf`;
  doc.save(fileName);
}
