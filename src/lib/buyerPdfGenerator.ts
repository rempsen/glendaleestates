import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AREA_DEFINITIONS, type AreaUpgradeSelection, type BacksplashGroutSelection } from '@/lib/upgradeCostData';
import { toBuyerWording } from '@/lib/outputLabels';
import { clientAreaNotes, type AreaNote } from '@/lib/areaNotes';
import { parseCustomPricing, type CustomPricing } from '@/lib/upgradeTotals';
import type { QuoteLine } from '@/lib/quoteLines';
import { buildLineRows, LINE_COLUMNS, INTERNAL_NOTES_HEADING, type LineRow } from '@/lib/lineRenderRows';

// Phase 2 Task 10 (spec §6.11): the PDF renders quote lines. Rows come from buildLineRows and every total from
// sumQuoteLines (via the same module), so this file holds no pricing arithmetic. The Phase 1 engine inputs moved to
// engineTotalsInput.ts and are re-exported here for the engine's remaining callers.
export { totalsInputFromSelections, type PdfPricingConfig, type UnitAreaDataForPdf } from '@/lib/engineTotalsInput';

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
  /** Staff-only copy: all lines, the Office Record and the internal-notes block. Never set for buyer-facing PDFs. */
  staffRecord?: { submittedAt?: string | null; status?: string | null; adminNotes?: string | null; salesComments?: string | null; areaInternalNotes?: AreaNote[] };
  footerLabel?: string;
  /** Staff copy only: small footer note (e.g. lines generated from selections because none are stored yet). */
  sourceNote?: string;
}

/** The lines to print and the GST rate for sumQuoteLines. */
export interface PdfQuote { lines: QuoteLine[]; gstRate: number }

/**
 * Home details the line tables do not carry (selection-row identity fields), shared by the PDF and the Word export.
 * Colours and products are in the lines; prices never appear here.
 */
export function buildHomeDetailRows(selections: BuyerSelections): string[][] {
  const rows: string[][] = [['Phone', selections.phoneNumber || 'Not provided']];
  if (selections.upgradeFloorSelection) rows.push(['Upgrade Floor', `Floor ${selections.upgradeFloorSelection}`]);
  if (selections.hardwoodUpgradeSelected) rows.push(['Hardwood Upgrade', 'Interested']);
  const docCount = selections.documentCount ?? (Array.isArray(selections.documentUploads) ? selections.documentUploads.length : 0);
  if (docCount > 0) rows.push(['Documents Uploaded', `${docCount} file${docCount > 1 ? 's' : ''} on record`]);
  return rows;
}

/** Open questions the buyer may see (custom_pricing follow-ups marked client-visible and not done). */
export function buyerOpenQuestions(selections: BuyerSelections): string[] {
  return (parseCustomPricing(selections.customPricing).followUps || [])
    .filter(f => f.clientVisible && !f.done && f.text?.trim()).map(f => f.text.trim());
}

export async function generateBuyerPreviewPDF(
  selections: BuyerSelections,
  quote: PdfQuote,
  outputOptions?: PdfOutputOptions
): Promise<string | void> {
  const { returnBase64 = false, saveToFile = true, staffRecord, footerLabel, sourceNote } = outputOptions || {};
  const model = buildLineRows(quote.lines, { buyerView: !staffRecord, gstRate: quote.gstRate });
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

  // Check if we need a new page
  const checkNewPage = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - 30) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };
  const heading = (title: string, underline = 50) => {
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text(title, margin, yPos);
    yPos += 3;
    doc.setDrawColor(...COLORS.primary);
    doc.setLineWidth(2);
    doc.line(margin, yPos, margin + underline, yPos);
    yPos += 10;
  };
  // Seven columns everywhere: location · item · product/colour · qty · unit price · amount · status.
  const lineTable = (body: any[], extra: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: yPos,
      head: [[...LINE_COLUMNS]],
      body,
      margin: { left: margin, right: margin, bottom: 30 },
      headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: COLORS.dark },
      columnStyles: {
        0: { cellWidth: 28 }, 1: { cellWidth: 40 }, 2: { cellWidth: 30 }, 3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 16 },
      },
      ...extra,
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;
  };
  const cells = (rows: LineRow[]) => rows.map(r => r.cells);

  // ---- Home details (identity fields from the selection row) ----
  heading('Home Details', 40);
  autoTable(doc, {
    startY: yPos,
    body: buildHomeDetailRows(selections),
    margin: { left: margin, right: margin },
    bodyStyles: { fontSize: 10, textColor: COLORS.dark },
    alternateRowStyles: { fillColor: COLORS.light },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 }, 1: { cellWidth: 'auto' } },
  });
  yPos = (doc as any).lastAutoTable.finalY + 15;

  // ---- Standard selections: included lines ----
  if (model.standard.length > 0) {
    checkNewPage(40);
    heading('Standard Selections (Included)');
    lineTable(cells(model.standard), { alternateRowStyles: { fillColor: COLORS.light } });
  }

  // ---- Premium upgrades: counted lines by section, each with its subtotal ----
  if (model.upgrades.bySection.length > 0) {
    checkNewPage(60);
    heading('Premium Upgrades', 40);
    const body: any[] = [];
    for (const group of model.upgrades.bySection) {
      body.push([{ content: group.title, colSpan: 7, styles: { fontStyle: 'bold', fillColor: COLORS.light } }]);
      body.push(...cells(group.rows));
      body.push([
        { content: `${group.title} subtotal`, colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: group.subtotalText, styles: { halign: 'right', fontStyle: 'bold' } },
        '',
      ]);
    }
    lineTable(body);
  }

  // ---- Not included in total: pending / under review / deferred, plus open questions ----
  const openItems = buyerOpenQuestions(selections);
  if (model.notInTotal.length > 0 || openItems.length > 0) {
    checkNewPage(50);
    heading('Not Included in Total', 45);
    const body: any[] = cells(model.notInTotal);
    openItems.forEach(t => body.push(['', t, '', '', '', '—', 'Open question']));
    lineTable(body);
    yPos -= 11;
    doc.setFontSize(8); doc.setFont('helvetica', 'italic'); doc.setTextColor(...COLORS.dark);
    doc.text('Items marked Pending, Under review or Deferred are not yet priced or approved and are not part of the total.', margin, yPos);
    yPos += 10;
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

  // ---- Totals: sumQuoteLines only (Upgrades, Window coverings, Subtotal, GST 5%, Total) ----
  if (model.totals.total > 0) {
    checkNewPage(70);
    heading('Complete Upgrade Summary', 55);
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    for (const r of model.totals.rows) {
      if (r.label === 'Total') break;
      if (r.label === 'Subtotal') {
        doc.setDrawColor(...COLORS.muted);
        doc.setLineWidth(0.5);
        doc.line(margin, yPos - 4, pageWidth - margin, yPos - 4);
        yPos += 2;
      }
      doc.text(`${r.label}:`, margin, yPos);
      doc.text(r.amountText, pageWidth - margin, yPos, { align: 'right' });
      yPos += 8;
    }
    yPos += 4;
    const total = model.totals.rows.find(r => r.label === 'Total')!;
    doc.setFillColor(...COLORS.primary);
    doc.roundedRect(margin, yPos, pageWidth - (margin * 2), 25, 3, 3, 'F');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('Total (incl. GST):', margin + 10, yPos + 16);
    doc.setFontSize(18);
    doc.text(total.amountText, pageWidth - margin - 10, yPos + 16, { align: 'right' });
    yPos += 35;
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


  // ---- Staff only, after every buyer-safe section: line internal notes (AGENTS.md rule 1) ----
  if (staffRecord && model.internalNotes.length > 0) {
    const y0 = (doc as any).lastAutoTable?.finalY ?? yPos;
    yPos = y0 > pageHeight - 80 ? (doc.addPage(), margin) : y0 + 10;
    doc.setFontSize(14);
    doc.setTextColor(...COLORS.primary);
    doc.setFont('helvetica', 'bold');
    doc.text(INTERNAL_NOTES_HEADING, margin, yPos);
    yPos += 8;
    autoTable(doc, {
      startY: yPos,
      body: model.internalNotes.map(n => [[n.location, n.item].filter(Boolean).join(' — '), n.note]),
      margin: { left: margin, right: margin, bottom: 30 },
      bodyStyles: { fontSize: 10, textColor: COLORS.dark },
      columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
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
  if (staffRecord && sourceNote) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(sourceNote, margin, footerY + 5);
  }

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
