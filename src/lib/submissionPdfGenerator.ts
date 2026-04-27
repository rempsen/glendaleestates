import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

// BMD brand colors
const COLORS = {
  primary: [45, 70, 60] as [number, number, number],
  secondary: [180, 140, 130] as [number, number, number],
  dark: [40, 40, 40] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  light: [245, 243, 240] as [number, number, number],
};

const loadLogo = (): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } else {
          console.warn('Could not get canvas context for logo');
          resolve(null);
        }
      } catch (e) {
        console.warn('Error converting logo to data URL:', e);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.warn('Could not load logo image');
      resolve(null);
    };
    // Use absolute path from public folder
    img.src = '/images/bmd-logo.png';
  });
};

// Area upgrade interface
interface AreaUpgrade {
  areaId: string;
  materialType: string;
  productName: string;
  productColor: string;
  comments: string;
}

// Area name mapping for display
const AREA_NAMES: Record<string, string> = {
  mainLiving: 'Main Living Area',
  secondBedroom: 'Second Bedroom',
  masterBedroom: 'Master Bedroom',
  secondBedroomCarpet: 'Second Bedroom Carpet',
  guestBathroom: 'Guest Bathroom',
  masterEnsuite: 'Master Ensuite',
  laundry: 'Laundry Room',
  backsplash: 'Kitchen Backsplash',
  allLvp: 'Entire Unit LVP',
};

// Material type display names
const MATERIAL_NAMES: Record<string, string> = {
  lvp: 'Premium LVP',
  hardwood: 'Hardwood',
  lvt: 'Premium LVT',
  carpet: 'Premium Carpet',
  tile: 'Premium Tile',
  nonstandard_lvp: 'Non Standard LVP Color',
  nonstandard_lvt: 'Non Standard LVT Color',
  nonstandard_tile: 'Non Standard Tile Color',
};

interface BuyerSubmission {
  id: string;
  created_at: string;
  unit_number: string;
  unit_type: string | null;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string;
  estimated_possession_date: string | null;
  has_stairs: boolean;
  lvp_colour: string | null;
  lvp_comments: string | null;
  spc_tile_colour: string | null;
  spc_tile_comments: string | null;
  backsplash_orientation: string | null;
  stair_carpet_colour: string | null;
  bedroom_flooring_choice: string | null;
  bedroom_carpet_colour: string | null;
  bedroom_lvp_colour: string | null;
  bedroom_lvp_same_as_main: boolean;
  additional_windows_qty: number;
  patio_doors_qty: number;
  window_total: number;
  window_comments?: string | null;
  upgrade_interests: Record<string, boolean>;
  status: string;
  // New upgrade fields
  area_upgrades?: AreaUpgrade[];
  upgrade_floor_selection?: string | null;
  backsplash_grout_enabled?: boolean;
  backsplash_grout_color?: string | null;
  backsplash_grout_comments?: string | null;
  heated_floor_bathrooms?: number;
  bathroom_tile_selected?: boolean;
  sales_comments?: string | null;
  upgrade_comments?: string | null;
  upgrade_interests_notes?: string | null;
}

export async function generateSubmissionPDF(submission: BuyerSubmission): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;

  // Try to load logo (non-blocking)
  let logoData: string | null = null;
  try {
    logoData = await loadLogo();
  } catch (e) {
    console.warn('Could not load logo:', e);
  }

  console.log('Starting PDF generation for unit:', submission.unit_number);

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
  doc.text('BUYER SUBMISSION', margin, yPos);
  doc.text(`Generated: ${format(new Date(), 'MMMM d, yyyy')}`, pageWidth - margin, yPos, { align: 'right' });
  
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
  doc.text(`Unit ${submission.unit_number}`, margin + 10, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(submission.unit_type || '', margin + 10, yPos + 22);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Buyer:', pageWidth / 2, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${submission.first_name} ${submission.last_name}`, pageWidth / 2, yPos + 22);
  doc.setFontSize(10);
  doc.text(submission.email, pageWidth / 2, yPos + 30);
  
  yPos += 50;

  // Submission Details
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text(`Submitted: ${format(new Date(submission.created_at), 'MMMM d, yyyy at h:mm a')}`, margin, yPos);
  if (submission.phone_number) {
    doc.text(`Phone: ${submission.phone_number}`, pageWidth / 2, yPos);
  }
  yPos += 8;
  if (submission.estimated_possession_date) {
    doc.text(`Est. Possession: ${format(new Date(submission.estimated_possession_date), 'MMMM d, yyyy')}`, margin, yPos);
  }
  
  yPos += 15;

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
    ['Main Floor LVP', formatColour(submission.lvp_colour), submission.lvp_comments || ''],
    ['Bathroom/Laundry Tile', formatColour(submission.spc_tile_colour), submission.spc_tile_comments || ''],
    ['Kitchen Backsplash', formatOrientation(submission.backsplash_orientation), ''],
  ];
  
  if (submission.has_stairs) {
    standardData.push(['Stairs Carpet', formatColour(submission.stair_carpet_colour), '']);
  }
  
  standardData.push([
    'Bedroom Flooring', 
    submission.bedroom_flooring_choice === 'lvp' 
      ? `LVP (${submission.bedroom_lvp_same_as_main ? 'Same as main' : formatColour(submission.bedroom_lvp_colour)})`
      : submission.bedroom_flooring_choice === 'carpet' 
        ? `Carpet (${formatColour(submission.bedroom_carpet_colour)})`
        : 'Not selected',
    ''
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'Selection', 'Notes']],
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
  doc.text('✓ Standard Roller Shades included in all bedrooms', margin, yPos);
  yPos += 10;

  // Window extensions pricing
  if (submission.additional_windows_qty > 0 || submission.patio_doors_qty > 0) {
    doc.setFillColor(...COLORS.light);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 45, 3, 3, 'F');
    
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'bold');
    doc.text('Optional Extensions', margin + 10, yPos + 12);
    
    let extY = yPos + 22;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    if (submission.additional_windows_qty > 0) {
      const windowTotal = submission.additional_windows_qty * 585;
      doc.text(`Additional Windows: ${submission.additional_windows_qty} × $585 = $${windowTotal.toLocaleString()}`, margin + 10, extY);
      extY += 8;
    }
    
    if (submission.patio_doors_qty > 0) {
      const patioTotal = submission.patio_doors_qty * 1275;
      doc.text(`Patio Door Panel Tracks: ${submission.patio_doors_qty} × $1,275 = $${patioTotal.toLocaleString()}`, margin + 10, extY);
    }
    
    // Total on right side
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(`Total: $${submission.window_total?.toFixed(2) || '0.00'}`, pageWidth - margin - 10, yPos + 30, { align: 'right' });
    
    yPos += 55;
  } else {
    doc.setTextColor(...COLORS.muted);
    doc.text('No additional window covering extensions selected.', margin, yPos);
    yPos += 15;
  }

  // Window comments
  if (submission.window_comments) {
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text(`Notes: ${submission.window_comments}`, margin, yPos);
    yPos += 10;
  }

  // Backsplash Grout Color Change
  if (submission.backsplash_grout_enabled) {
    yPos += 10;
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Custom Backsplash Grout', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 55, yPos);
    yPos += 10;

    doc.setFillColor(255, 243, 205);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 30, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    doc.text(`Grout Color: ${submission.backsplash_grout_color || 'Not specified'}`, margin + 10, yPos + 12);
    doc.text('Cost: $300.00 + GST ($315.00 total)', margin + 10, yPos + 22);
    if (submission.backsplash_grout_comments) {
      yPos += 35;
      doc.setTextColor(...COLORS.muted);
      doc.text(`Comments: ${submission.backsplash_grout_comments}`, margin, yPos);
    }
    yPos += 15;
  }

  // Area Upgrades Section
  if (submission.area_upgrades && submission.area_upgrades.length > 0) {
    // Check if we need a new page
    if (yPos > pageHeight - 100) {
      doc.addPage();
      yPos = margin;
    }

    yPos += 10;
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Area Upgrades', margin, yPos);
    if (submission.upgrade_floor_selection) {
      doc.setFontSize(10);
      doc.text(`(Floor ${submission.upgrade_floor_selection})`, margin + 45, yPos);
    }
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 40, yPos);
    yPos += 10;

    // Helpers — render placeholders clearly when structured identifiers are missing.
    // The edge function backfills incomplete entries (e.g. comment-only rows) with
    // `unspecified_area_N` / `unspecified` so the buyer's note is never lost.
    const formatAreaLabel = (areaId: string): string => {
      if (!areaId) return 'Unspecified Area';
      if (AREA_NAMES[areaId]) return AREA_NAMES[areaId];
      if (areaId.startsWith('unspecified_area')) {
        const n = areaId.replace(/^unspecified_area_?/, '');
        return n ? `Unspecified Area #${n} (needs review)` : 'Unspecified Area (needs review)';
      }
      return areaId;
    };
    const formatMaterialLabel = (materialType: string): string => {
      if (!materialType) return 'Not specified';
      if (MATERIAL_NAMES[materialType]) return MATERIAL_NAMES[materialType];
      if (materialType === 'unspecified') return 'Not specified (needs review)';
      return materialType;
    };

    const upgradeData: string[][] = submission.area_upgrades.map(u => [
      formatAreaLabel(u.areaId),
      formatMaterialLabel(u.materialType),
      u.productName || (u.comments ? '— (see comment)' : 'N/A'),
      u.productColor || (u.comments ? '— (see comment)' : 'N/A'),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Area', 'Material', 'Product', 'Color']],
      body: upgradeData,
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: [155, 89, 182],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: COLORS.dark,
      },
      alternateRowStyles: {
        fillColor: [245, 238, 248],
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Add upgrade comments — render every non-empty comment, even when the area
    // is a placeholder, so admins can recover and re-classify the note.
    const upgradesWithComments = submission.area_upgrades.filter(u => u.comments);
    if (upgradesWithComments.length > 0) {
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.muted);
      upgradesWithComments.forEach(u => {
        const label = formatAreaLabel(u.areaId);
        const lines = doc.splitTextToSize(`${label}: ${u.comments}`, pageWidth - margin * 2);
        if (yPos + lines.length * 5 > pageHeight - 25) {
          doc.addPage();
          yPos = margin;
        }
        doc.text(lines, margin, yPos);
        yPos += lines.length * 5 + 2;
      });
    }
  }

  // Heated Floors Section
  if (submission.heated_floor_bathrooms && submission.heated_floor_bathrooms > 0) {
    yPos += 10;
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Heated Floors', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 35, yPos);
    yPos += 10;

    doc.setFillColor(255, 237, 213);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    const heatedTotal = submission.heated_floor_bathrooms * 1650 * 1.05;
    doc.text(`Bathrooms with Heated Floors: ${submission.heated_floor_bathrooms}`, margin + 10, yPos + 12);
    doc.text(`Cost: ${submission.heated_floor_bathrooms} × $1,650 + GST = $${heatedTotal.toFixed(2)}`, margin + 10, yPos + 20);
    
    yPos += 35;
  }

  // Upgrade Interests
  yPos += 10;
  
  // Check if we need a new page
  if (yPos > pageHeight - 60) {
    doc.addPage();
    yPos = margin;
  }

  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('Upgrade Interests', margin, yPos);
  yPos += 3;
  
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(2);
  doc.line(margin, yPos, margin + 45, yPos);
  yPos += 10;

  const interests: string[] = [];
  if (submission.upgrade_interests?.flooring) interests.push('Upgraded Flooring Options');
  if (submission.upgrade_interests?.tile) interests.push('Tile Upgrades');
  if (submission.upgrade_interests?.['heated-floor']) interests.push('Heated Tile Flooring');
  if (submission.upgrade_interests?.automation) interests.push('Powered/Automated Window Coverings');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  if (interests.length > 0) {
    doc.setTextColor(...COLORS.dark);
    interests.forEach((interest, i) => {
      doc.text(`• ${interest}`, margin, yPos + (i * 7));
    });
    yPos += interests.length * 7 + 10;
    doc.setTextColor(...COLORS.muted);
    doc.text('Customer has expressed interest in these premium options.', margin, yPos);
  } else {
    doc.setTextColor(...COLORS.muted);
    doc.text('No upgrade interests indicated.', margin, yPos);
  }

  // Sales/Admin Comments
  if (submission.sales_comments) {
    yPos += 15;
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Admin Notes', margin, yPos);
    yPos += 3;
    
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 35, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.dark);
    
    // Split long comments into multiple lines
    const splitComments = doc.splitTextToSize(submission.sales_comments, pageWidth - (margin * 2));
    doc.text(splitComments, margin, yPos);
    yPos += splitComments.length * 5 + 5;
  }

  // ===== Buyer Comments captured throughout the wizard =====
  const buyerComments: Array<{ label: string; text: string }> = [];
  if (submission.lvp_comments) buyerComments.push({ label: 'Main Floor LVP', text: submission.lvp_comments });
  if (submission.spc_tile_comments) buyerComments.push({ label: 'Bathroom Tile', text: submission.spc_tile_comments });
  if (submission.window_comments) buyerComments.push({ label: 'Window Coverings', text: submission.window_comments });
  if (submission.backsplash_grout_comments) buyerComments.push({ label: 'Backsplash Grout', text: submission.backsplash_grout_comments });
  if (submission.upgrade_interests_notes) buyerComments.push({ label: 'Upgrade Interests', text: submission.upgrade_interests_notes });
  if (submission.upgrade_comments) buyerComments.push({ label: 'Upgrade Pricing Summary', text: submission.upgrade_comments });

  if (buyerComments.length > 0) {
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = margin;
    } else {
      yPos += 10;
    }

    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text('Buyer Comments & Notes', margin, yPos);
    yPos += 3;
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + 50, yPos);
    yPos += 10;

    doc.setFontSize(10);
    buyerComments.forEach(entry => {
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
  doc.text('BMD Materials | Selection Portal', margin, footerY);
  doc.text(`Status: ${submission.status}`, pageWidth - margin, footerY, { align: 'right' });

  // Save the PDF
  const filename = `unit-${submission.unit_number}-selection-summary.pdf`;
  console.log('Saving PDF as:', filename);
  doc.save(filename);
  console.log('PDF save triggered');
}

function formatColour(colour: string | null): string {
  if (!colour) return 'Not selected';
  return colour
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatOrientation(orientation: string | null): string {
  if (!orientation) return 'Not selected';
  return orientation.charAt(0).toUpperCase() + orientation.slice(1);
}
