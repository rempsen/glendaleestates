import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } from 'docx';
import { parseCustomPricing } from '@/lib/customPricing';
import { internalAreaNotes } from '@/lib/areaNotes';
import { clientNoteRows } from '@/lib/clientNotes';
import { buildLineRows, LINE_COLUMNS, INTERNAL_NOTES_HEADING } from '@/lib/lineRenderRows';
import { buildWordDetailRows, buildWordLineTables, buildWordOpenQuestions } from '@/lib/submissionWordRows';
import { loadSavedSubmissionContext } from '@/lib/savedSubmissionPdf';
import { GENERATED_LINES_NOTE } from '@/lib/generateInputFromSelections';
import { buildHomeDetailRows } from '@/lib/buyerPdfGenerator';
import { buyerPdfSelectionsFromHeader, type MyQuoteHeader } from '@/lib/myQuoteModel';
import type { QuoteLine } from '@/lib/quoteLines';

// A cell may hold a client note on a second line ("item\nnote"): one paragraph per line.
const cell = (t: string, bold = false, right = false) => new TableCell({
  children: (t || '').split('\n').map((line, i) => new Paragraph({
    alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT,
    children: [new TextRun({ text: line, bold: bold && i === 0, italics: i > 0 })],
  })),
});
const table = (header: string[] | null, rows: string[][], rightCols: number[] = []) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    ...(header ? [new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, true, rightCols.includes(i))) })] : []),
    ...rows.map(r => new TableRow({ children: r.map((c, i) => cell(c, false, rightCols.includes(i))) })),
  ],
});
const lineTable = (rows: string[][]) => table([...LINE_COLUMNS], rows, [3, 4, 5]);
const h = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } });
const p = (t: string, italics = false) => new Paragraph({ children: [new TextRun({ text: t, italics })] });

interface WordQuoteInput {
  title: string;
  subtitle: string;
  detailRows: string[][];
  tables: ReturnType<typeof buildWordLineTables>;
  notes: string[][];
  /** Staff only; printed after all buyer-safe content (AGENTS.md rule 1). */
  internal: string[];
  sourceNote?: string;
  fileName: string;
}

async function saveWordQuote(i: WordQuoteInput): Promise<void> {
  const t = i.tables;
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: i.title, heading: HeadingLevel.HEADING_1 }),
    p(i.subtitle),
    p(`Generated ${new Date().toLocaleDateString('en-CA')}. Prices exclude GST unless noted; PST included.`, true),
    h('Home details'), table(null, i.detailRows),
    ...(t.standard.length ? [h('Standard selections'), lineTable(t.standard)] : []),
    ...(t.upgrades.length ? [h('Premium upgrades'), lineTable(t.upgrades)] : []),
    p(''),
    table(['', 'Amount'], t.totals, [1]),
    ...(t.notInTotal.length ? [h('Not included in total'), lineTable(t.notInTotal),
      p('Pending, under review and deferred items are not priced or approved and are not part of the total.', true)] : []),
    ...(i.notes.length ? [h('Notes'), ...i.notes.map(([k, v]) => p(`${k}: ${v}`))] : []),
    ...(i.internal.length ? [h(INTERNAL_NOTES_HEADING), ...i.internal.map(x => p(`• ${x}`))] : []),
    ...(i.sourceNote ? [p(''), p(i.sourceNote, true)] : []),
  ] }] });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = i.fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Editable Word copy of the saved selections and itemized quote, from the same fresh record and the same lines as
 * the PDF (loadSavedSubmissionContext + buildLineRows). Buyer-safe content first; `staff` appends the internal block.
 */
export async function downloadSubmissionWord(id: string, staff = false): Promise<void> {
  const { s, lines, linesSource, gstRate } = await loadSavedSubmissionContext(id);
  const model = buildLineRows(lines, { buyerView: !staff, gstRate });
  const cp = parseCustomPricing((s as any).custom_pricing);

  // Client-facing notes: the buyer PDF's "Your Comments & Notes" rows (same labels, order and text).
  const notes = clientNoteRows(s);

  // Staff only, after all buyer-safe content (AGENTS.md rule 1).
  const internal: string[] = [];
  if (staff) {
    model.internalNotes.forEach(n => internal.push(`${[n.location, n.item].filter(Boolean).join(' — ')}: ${n.note}`));
    internalAreaNotes(Array.isArray(s.area_upgrades) ? (s.area_upgrades as never[]) : []).forEach(n => internal.push(`Upgrade — ${n.areaId} (internal note): ${n.text}`));
    if (s.sales_comments?.trim()) internal.push(`Admin notes: ${s.sales_comments.trim()}`);
    if ((s as any).admin_notes?.trim()) internal.push(`Internal notes: ${(s as any).admin_notes.trim()}`);
    if (cp.basementNotes) internal.push(`Basement: ${cp.basementNotes}`);
    (cp.followUps || []).filter(f => !f.done && !f.clientVisible && f.text?.trim()).forEach(f => internal.push(`Open question (internal): ${f.text.trim()}`));
  }

  await saveWordQuote({
    title: `Glendale Estates — Unit ${s.unit_number} Selections & Quote`,
    subtitle: `${s.first_name} ${s.last_name} · ${s.unit_type || ''} · Status: ${s.status || 'submitted'}`,
    detailRows: buildWordDetailRows(s),
    tables: buildWordLineTables(model, buildWordOpenQuestions(s)),
    notes,
    internal,
    sourceNote: staff && linesSource !== 'db' ? GENERATED_LINES_NOTE : undefined,
    fileName: `Unit-${s.unit_number}-selections.docx`,
  });
}

/**
 * Buyer copy for /my-quote: from the buyer-safe RPC lines and header only (never `staff`, never an internal note).
 * Same buildLineRows model and tables as the staff path, so the totals match the PDF and the rail.
 */
export async function downloadBuyerQuoteWord(header: MyQuoteHeader, lines: QuoteLine[], gstRate: number): Promise<void> {
  const model = buildLineRows(lines, { buyerView: true, gstRate });
  await saveWordQuote({
    title: `Glendale Estates — Unit ${header.unit_number} Quote`,
    subtitle: `${header.first_name} ${header.last_name} · ${header.unit_type || ''} · Status: ${header.status || 'submitted'}`,
    detailRows: buildHomeDetailRows(buyerPdfSelectionsFromHeader(header)),
    tables: buildWordLineTables(model),
    notes: [],
    internal: [],
    fileName: `Unit-${header.unit_number}-quote.docx`,
  });
}
