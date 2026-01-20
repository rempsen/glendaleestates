import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { 
  lvpOptions, 
  spcTileOptions, 
  carpetOptions, 
  backsplashProduct,
  windowPricing,
  heatedFloorPricing,
} from '@/lib/mockData';
import { 
  AreaUpgradeSelection,
  BacksplashGroutSelection,
  calculateTotalUpgradeCost,
  calculateBacksplashGroutPrice,
  normalizeUnitTypeCode,
  AREA_DEFINITIONS,
  GST_RATE,
} from '@/lib/upgradeCostData';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

// BMD brand colors
const COLORS = {
  primary: [45, 70, 60] as [number, number, number],
  secondary: [180, 140, 130] as [number, number, number],
  dark: [40, 40, 40] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  light: [245, 243, 240] as [number, number, number],
};

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
  unitTypeCode: string | null
): Promise<void> {
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

  doc.autoTable({
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

  // Window Coverings Section
  const windowSubtotal = (selections.additionalWindowsQty * windowPricing.additionalWindow) +
                        (selections.patioDoorsQty * windowPricing.patioDoor) +
                        (selections.automatedWindowsQty * windowPricing.automatedMotor);

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
        `${selections.additionalWindowsQty} × $${windowPricing.additionalWindow.toFixed(2)}`,
        `$${(selections.additionalWindowsQty * windowPricing.additionalWindow).toFixed(2)}`
      ]);
    }
    
    if (selections.patioDoorsQty > 0) {
      windowData.push([
        'Patio Door Panel Track',
        `${selections.patioDoorsQty} × $${windowPricing.patioDoor.toFixed(2)}`,
        `$${(selections.patioDoorsQty * windowPricing.patioDoor).toFixed(2)}`
      ]);
    }
    
    if (selections.automatedWindowsQty > 0) {
      windowData.push([
        'Somfy Automation',
        `${selections.automatedWindowsQty} × $${windowPricing.automatedMotor.toFixed(2)}`,
        `$${(selections.automatedWindowsQty * windowPricing.automatedMotor).toFixed(2)}`
      ]);
    }

    const windowGst = windowSubtotal * windowPricing.gstRate;
    const windowTotal = windowSubtotal + windowGst;

    windowData.push(['', 'Subtotal:', `$${windowSubtotal.toFixed(2)}`]);
    windowData.push(['', 'GST (5%):', `$${windowGst.toFixed(2)}`]);
    windowData.push(['', 'Total:', `$${windowTotal.toFixed(2)}`]);

    doc.autoTable({
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
  const upgradeCalc = calculateTotalUpgradeCost(effectiveUnitCode || '', selections.areaUpgrades);
  const heatedFloorSubtotal = selections.bathroomTileSelected || selections.areaUpgrades.some(s => ['guestBathroom', 'masterEnsuite'].includes(s.areaId))
    ? selections.heatedFloorBathrooms * heatedFloorPricing.perBathroom
    : 0;
  const groutPrice = selections.backsplashGrout?.enabled ? calculateBacksplashGroutPrice() : null;
  
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

    const upgradesGst = upgradesSubtotal * GST_RATE;
    const upgradesTotalWithGst = upgradesSubtotal + upgradesGst;

    upgradeData.push(['Subtotal:', `$${upgradesSubtotal.toFixed(2)}`]);
    upgradeData.push(['GST (5%):', `$${upgradesGst.toFixed(2)}`]);
    upgradeData.push(['Total:', `$${upgradesTotalWithGst.toFixed(2)}`]);

    doc.autoTable({
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
  const grandTotal = windowSubtotal * (1 + windowPricing.gstRate) + upgradesSubtotal * (1 + GST_RATE);
  
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
