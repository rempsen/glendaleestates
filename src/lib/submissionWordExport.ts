import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } from 'docx';
import { computeUpgradeTotals, parseCustomPricing, LINE_STATUS_LABELS } from '@/lib/upgradeTotals';
import { totalsInputFromSelections } from '@/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import { internalAreaNotes } from '@/lib/areaNotes';
import { buildWordSelectionRows } from '@/lib/submissionWordRows';
import { loadSavedSubmissionContext } from '@/lib/savedSubmissionPdf';

const money = (n: number) => `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cell = (t: string, bold = false, right = false) => new TableCell({
  children: [new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t, bold })] })],
});
const table = (header: string[], rows: string[][], rightCols: number[] = []) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, true, rightCols.includes(i))) }),
    ...rows.map(r => new TableRow({ children: r.map((c, i) => cell(c, false, rightCols.includes(i))) })),
  ],
});
const h = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 } });
const p = (t: string, italics = false) => new Paragraph({ children: [new TextRun({ text: t, italics })] });

/**
 * Editable Word copy of the saved selections and itemized quote.
 * Built from the same fresh record + totals as the PDF. `staff` adds internal follow-ups and basement notes.
 */
export async function downloadSubmissionWord(id: string, staff = true): Promise<void> {
  const { s, pricing, unitCode } = await loadSavedSubmissionContext(id);
  const sel = toBuyerPdfSelections(s);
  const totals = computeUpgradeTotals(totalsInputFromSelections(sel, unitCode), pricing);
  const cp = parseCustomPricing((s as any).custom_pricing);

  const selRows = buildWordSelectionRows(s, pricing, unitCode);
  const quoteRows = totals.lineItems.map(li => [li.group, [li.label, li.detail].filter(Boolean).join(' — '), money(li.amount)]);
  const notIn = (totals.pieces.uncommittedItems || []).map(u => [[u.area, u.label, u.detail].filter(Boolean).join(' — '), LINE_STATUS_LABELS[u.status], u.amount === null ? 'Pending' : money(u.amount)]);
  const followUps = (cp.followUps || []).filter(f => !f.done && (staff || f.clientVisible));

  const notes = [
    ['Flooring', s.lvp_comments], ['Tile', s.spc_tile_comments], ['Windows', s.window_comments], ['Upgrades', s.upgrade_comments],
  ].filter(([, v]) => v) as string[][];
  // Buyer copy prints clientComment only (in the Selections table); staff also get the internal `comments`, labelled.
  if (staff) internalAreaNotes(Array.isArray(s.area_upgrades) ? (s.area_upgrades as never[]) : []).forEach(n => notes.push([`Upgrade — ${n.areaId} (internal note)`, n.text]));

  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: `Glendale Estates — Unit ${s.unit_number} Selections & Quote`, heading: HeadingLevel.HEADING_1 }),
    p(`${s.first_name} ${s.last_name} · ${s.unit_type || ''} · Status: ${s.status || 'submitted'}`),
    p(`Generated ${new Date().toLocaleDateString('en-CA')}. Prices exclude GST unless noted; PST included.`, true),
    h('Selections'), table(['Item', 'Selection'], selRows),
    h('Itemized Quote'), table(['Category', 'Item', 'Amount'], quoteRows, [2]),
    p(''),
    table(['', 'Amount'], [
      ['Window coverings', money(totals.windowSubtotal)], ['Premium upgrades', money(totals.upgradesSubtotal)],
      ['Subtotal before GST', money(totals.grandSubtotal)], ['GST (5%)', money(totals.gst)], ['Total', money(totals.grandTotal)],
    ], [1]),
    ...(notIn.length ? [h('Not Included in Total'), table(['Item', 'Status', 'Price'], notIn, [2]),
      p('Pending, under review and deferred items are not priced or approved and are not part of the total.', true)] : []),
    ...(notes.length ? [h('Notes'), ...notes.map(([k, v]) => p(`${k}: ${v}`))] : []),
    ...(staff && cp.basementNotes ? [h('Basement'), p(cp.basementNotes)] : []),
    ...(followUps.length ? [h('Open Questions'), ...followUps.map(f => p(`• ${f.text}`))] : []),
  ] }] });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Unit-${s.unit_number}-selections.docx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
