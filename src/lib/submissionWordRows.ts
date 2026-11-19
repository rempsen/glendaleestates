import type { Tables } from '@/integrations/supabase/types';
import { buildHomeDetailRows, buyerOpenQuestions } from '@/lib/buyerPdfGenerator';
import { toBuyerPdfSelections } from '@/lib/buyerPdfSelections';
import type { LineRenderModel } from '@/lib/lineRenderRows';

/**
 * Word export tables, docx-free so they are testable. Line tables come from the same buildLineRows model as the PDF
 * (seven columns: location · item · product/colour · qty · unit price · amount · status); no arithmetic here.
 */
export interface WordLineTables {
  standard: string[][];
  /** Section title rows, line rows and "<Section> subtotal" rows, all seven cells wide. */
  upgrades: string[][];
  notInTotal: string[][];
  totals: string[][];
}

export function buildWordLineTables(model: LineRenderModel, openQuestions: string[] = []): WordLineTables {
  const upgrades: string[][] = [];
  for (const g of model.upgrades.bySection) {
    upgrades.push([g.title, '', '', '', '', '', '']);
    upgrades.push(...g.rows.map(r => r.cells));
    upgrades.push(['', `${g.title} subtotal`, '', '', '', g.subtotalText, '']);
  }
  return {
    standard: model.standard.map(r => r.cells),
    upgrades,
    notInTotal: [...model.notInTotal.map(r => r.cells), ...openQuestions.map(t => ['', t, '', '', '', '—', 'Open question'])],
    totals: model.totals.rows.map(r => [r.label, r.amountText]),
  };
}

/** Home detail rows (identity fields the line tables do not carry), same as the PDF. */
export function buildWordDetailRows(s: Tables<'buyer_selections'>): string[][] {
  return buildHomeDetailRows(toBuyerPdfSelections(s));
}

/** Client-visible open questions for the buyer-safe part of the Word export. */
export function buildWordOpenQuestions(s: Tables<'buyer_selections'>): string[] {
  return buyerOpenQuestions(toBuyerPdfSelections(s));
}
