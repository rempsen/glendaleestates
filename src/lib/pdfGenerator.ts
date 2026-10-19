import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  HomeData, 
  lvpOptions, 
  spcTileOptions, 
  carpetOptions, 
  backsplashProduct,
  backsplashOrientations,
  windowPricing,
  lvpSpecs,
  spcTileSpecs,
  carpetSpecs,
  windowCoveringProduct
  resolveOptionName,
} from "@/lib/mockData";

// BMD brand colors
const COLORS = {
  primary: [45, 70, 60] as [number, number, number],     // Forest green
  secondary: [180, 140, 130] as [number, number, number], // Muted rose (from logo)
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

export async function generateBuyerSelectionPDF(home: HomeData): Promise<void> {
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
  doc.text('Selection Summary', pageWidth - margin, yPos + 12, { align: 'right' });
  
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
  doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 30, 3, 3, 'F');
  
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(home.lot, margin + 10, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(home.address, margin + 10, yPos + 22);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer:', pageWidth / 2, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(home.buyerName, pageWidth / 2, yPos + 22);
  
  yPos += 45;

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
  const selections = home.selections;
  const standardData = [
    ['Main Floor LVP', resolveOptionName(lvpOptions, selections?.lvpColour) || 'Not selected', lvpSpecs.productType],
    ['Bathroom/Laundry Tile', resolveOptionName(spcTileOptions, selections?.spcTileColour) || 'Not selected', `${spcTileSpecs.size} ${spcTileSpecs.collection}`],
    ['Kitchen Backsplash', resolveOptionName(backsplashOrientations, selections?.backsplashOrientation) || 'Not selected', `${backsplashProduct.name} ${backsplashProduct.size}`],
    ['Stairs Carpet', home.hasStairs ? (resolveOptionName(carpetOptions, selections?.stairCarpetColour) || 'Not selected') : 'N/A (no stairs)', carpetSpecs.productType],
    ['Bedroom Flooring', selections?.bedroomFlooringChoice === 'lvp' ? 'Luxury Vinyl Plank' : (selections?.bedroomFlooringChoice === 'carpet' ? 'Carpet' : 'Not selected'), ''],
  ];

  if (selections?.bedroomFlooringChoice === 'carpet' && selections?.bedroomCarpetColour) {
    standardData.push(['Bedroom Carpet Colour', resolveOptionName(carpetOptions, selections.bedroomCarpetColour) || '', '']);
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'Selection', 'Product Details']],
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
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 60 },
      2: { cellWidth: 'auto', textColor: COLORS.muted },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 20;

  // Window Coverings Section
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('Window Coverings', margin, yPos);
  yPos += 3;
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(2);
  doc.line(margin, yPos, margin + 40, yPos);
  yPos += 10;

  // Standard window info
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  doc.setFont('helvetica', 'normal');
  doc.text(`✓ Standard ${windowCoveringProduct.name} included in all bedrooms`, margin, yPos);
  yPos += 8;
  doc.setTextColor(...COLORS.muted);
  doc.text(windowCoveringProduct.features.join(' • '), margin, yPos);
  yPos += 15;

  // Window extensions pricing
  if (selections && (selections.additionalWindowsQty > 0 || selections.patioDoorsQty > 0)) {
    doc.setFillColor(...COLORS.light);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 50, 3, 3, 'F');
    
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.text('Optional Extensions', margin + 10, yPos + 12);
    
    let extY = yPos + 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    if (selections.additionalWindowsQty > 0) {
      const windowTotal = selections.additionalWindowsQty * windowPricing.additionalWindow;
      doc.text(`Additional Windows: ${selections.additionalWindowsQty} × $${windowPricing.additionalWindow} = $${windowTotal.toLocaleString()}`, margin + 10, extY);
      extY += 8;
    }
    
    if (selections.patioDoorsQty > 0) {
      const patioTotal = selections.patioDoorsQty * windowPricing.patioDoor;
      doc.text(`Patio Door Panel Tracks: ${selections.patioDoorsQty} × $${windowPricing.patioDoor} = $${patioTotal.toLocaleString()}`, margin + 10, extY);
    }
    
    // Totals on right side
    doc.setFont('helvetica', 'bold');
    doc.text(`Subtotal: $${home.windowExtensionSubtotal.toLocaleString()}`, pageWidth - margin - 10, yPos + 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`GST (5%): $${home.windowExtensionGST.toLocaleString()}`, pageWidth - margin - 10, yPos + 32, { align: 'right' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(`Total: $${home.windowExtensionTotal.toLocaleString()}`, pageWidth - margin - 10, yPos + 44, { align: 'right' });
    
    yPos += 60;
  } else {
    doc.setTextColor(...COLORS.muted);
    doc.text('No additional window covering extensions selected.', margin, yPos);
    yPos += 15;
  }

  // Upgrade Interests
  yPos += 10;
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('Upgrade Interests (Phase 2)', margin, yPos);
  yPos += 3;
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(2);
  doc.line(margin, yPos, margin + 45, yPos);
  yPos += 10;

  const interests: string[] = [];
  if (selections?.upgradeInterestFlooring) interests.push('Upgraded Flooring Options');
  if (selections?.upgradeInterestTile) interests.push('Tile Upgrades');
  if (selections?.upgradeInterestHeatedFloor) interests.push('Heated Tile Flooring');
  if (selections?.upgradeInterestAutomation) interests.push('Powered/Automated Window Coverings');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  if (interests.length > 0) {
    doc.setTextColor(...COLORS.dark);
    interests.forEach((interest, i) => {
      doc.text(`• ${interest}`, margin, yPos + (i * 7));
    });
    yPos += interests.length * 7 + 10;
    doc.setTextColor(...COLORS.muted);
    doc.text('Our team will contact you with details and pricing for these options.', margin, yPos);
  } else {
    doc.setTextColor(...COLORS.muted);
    doc.text('No upgrade interests indicated.', margin, yPos);
  }

  // Footer
  const footerY = pageHeight - 20;
  doc.setDrawColor(...COLORS.secondary);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);
  
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.muted);
  doc.text('BMD Materials | Glendale Estates Selection Portal', margin, footerY);
  doc.text(`Version ${home.selectionVersion || 1} • ${home.lastActivityDate}`, pageWidth - margin, footerY, { align: 'right' });

  // Save the PDF
  doc.save(`${home.lot.replace(' ', '-')}-selection-summary.pdf`);
}

export async function generateAllSelectionsPDF(homes: HomeData[]): Promise<void> {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = margin;

  // Try to load logo
  let logoData: string | null = null;
  try {
    logoData = await loadLogo();
  } catch (e) {
    console.warn('Could not load logo:', e);
  }

  // Header
  if (logoData) {
    doc.addImage(logoData, 'PNG', margin, yPos, 35, 17);
  }
  
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.primary);
  doc.text('Glendale Estates — All Selections', pageWidth / 2, yPos + 10, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Generated: ${new Date().toLocaleDateString()} | ${homes.length} homes`, pageWidth / 2, yPos + 18, { align: 'center' });
  
  yPos += 30;

  // Table data
  const tableData = homes
    .filter(h => h.selections)
    .map(h => [
      h.lot,
      h.buyerName,
      resolveOptionName(lvpOptions, h.selections?.lvpColour) || '—',
      resolveOptionName(spcTileOptions, h.selections?.spcTileColour) || '—',
      h.selections?.backsplashOrientation || '—',
      resolveOptionName(carpetOptions, h.selections?.stairCarpetColour) || '—',
      h.selections?.additionalWindowsQty || 0,
      h.selections?.patioDoorsQty || 0,
      h.windowExtensionTotal > 0 ? `$${h.windowExtensionTotal.toLocaleString()}` : '—',
    ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Lot', 'Buyer', 'LVP', 'SPC Tile', 'Backsplash', 'Stairs', 'Add. Win', 'Patio', 'Total']],
    body: tableData,
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: COLORS.dark,
    },
    alternateRowStyles: {
      fillColor: COLORS.light,
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 45 },
      2: { cellWidth: 30 },
      3: { cellWidth: 35 },
      4: { cellWidth: 25 },
      5: { cellWidth: 35 },
      6: { cellWidth: 20, halign: 'center' },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
    },
  });

  // Save
  doc.save('glendale-estates-all-selections.pdf');
}
