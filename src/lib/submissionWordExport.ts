import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } from 'docx';
import { parseCustomPricing } from '@/lib/upgradeTotals';
import { internalAreaNotes } from '@/lib/areaNotes';
import { buildLineRows, LINE_COLUMNS, INTERNAL_NOTES_HEADING } from '@/lib/lineRenderRows';
import { buildWordDetailRows, buildWordLineTables, buildWordOpenQuestions } from '@/lib/submissionWordRows';
import { loadSavedSubmissionContext } from '@/lib/savedSubmissionPdf';
import { GENERATED_LINES_NOTE } from '@/lib/generateInputFromSelections';

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

/**
 * Editable Word copy of the saved selections and itemized quote, from the same fresh record and the same lines as
 * the PDF (loadSavedSubmissionContext + buildLineRows). Buyer-safe content first; `staff` appends the internal block.
 */
export async function downloadSubmissionWord(id: string, staff = true): Promise<void> {
  const { s, lines, linesSource, gstRate } = await loadSavedSubmissionContext(id);
  const model = buildLineRows(lines, { buyerView: !staff, gstRate });
  const t = buildWordLineTables(model, buildWordOpenQuestions(s));
  const cp = parseCustomPricing((s as any).custom_pricing);

  const notes = [
    ['Flooring', s.lvp_comments], ['Tile', s.spc_tile_comments], ['Windows', s.window_comments], ['Upgrades', s.upgrade_comments],
  ].filter(([, v]) => v) as string[][];

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

  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: `Glendale Estates — Unit ${s.unit_number} Selections & Quote`, heading: HeadingLevel.HEADING_1 }),
    p(`${s.first_name} ${s.last_name} · ${s.unit_type || ''} · Status: ${s.status || 'submitted'}`),
    p(`Generated ${new Date().toLocaleDateString('en-CA')}. Prices exclude GST unless noted; PST included.`, true),
    h('Home details'), table(null, buildWordDetailRows(s)),
    ...(t.standard.length ? [h('Standard selections'), lineTable(t.standard)] : []),
    ...(t.upgrades.length ? [h('Premium upgrades'), lineTable(t.upgrades)] : []),
    p(''),
    table(['', 'Amount'], t.totals, [1]),
    ...(t.notInTotal.length ? [h('Not included in total'), lineTable(t.notInTotal),
      p('Pending, under review and deferred items are not priced or approved and are not part of the total.', true)] : []),
    ...(notes.length ? [h('Notes'), ...notes.map(([k, v]) => p(`${k}: ${v}`))] : []),
    ...(internal.length ? [h(INTERNAL_NOTES_HEADING), ...internal.map(x => p(`• ${x}`))] : []),
    ...(staff && linesSource === 'generated' ? [p(''), p(GENERATED_LINES_NOTE, true)] : []),
  ] }] });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Unit-${s.unit_number}-selections.docx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
