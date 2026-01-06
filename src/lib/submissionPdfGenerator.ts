import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';

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
}

export async function generateSubmissionPDF(submission: BuyerSubmission): Promise<void> {
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

  doc.autoTable({
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

  // Upgrade Interests
  yPos += 10;
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
  doc.save(`unit-${submission.unit_number}-selection-summary.pdf`);
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
