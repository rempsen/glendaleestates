// Drift detector (Phase 2 Task 18, spec §6.4): for each submission (or one, by id), the STORED quote_lines against
// lines freshly GENERATED from the buyer_selections row at live prices. Read only. Run after the backfill: every
// unit must report `ok`. Later, a `drift` row means staff edited the stored lines in the console (expected) or the
// generator / pricing changed under a stored quote (investigate).
//
// Returns { audited, okCount, driftCount, noLinesCount, errorCount, rows: [{ submission_id, unit_number,
// generated_subtotal, stored_subtotal, diff, windows_diff, line_count, status: 'ok' | 'drift' | 'no lines' }], errors }.
import { compareStoredToGenerated, type ComparableLine } from '../_shared/compareStoredToGenerated.ts';
import { savedSubmissionLinesCore } from '../_shared/savedSubmissionLines.ts';
import type { QuotePricing } from '../_shared/quoteLines.ts';
import type { BuyerSelectionsRowLike } from '../_shared/quoteSelectionsFromRow.ts';

export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditDeps {
  /** buyer_selections rows (one when submissionId is given), ordered by unit number. */
  listSubmissions(submissionId: string | null): Promise<Array<BuyerSelectionsRowLike & { id: string; unit_number: string }>>;
  /** Every stored quote_lines row for a submission (all statuses). */
  storedLines(submissionId: string): Promise<ComparableLine[]>;
  loadPricing(): Promise<QuotePricing>;
}

export interface AuditRow {
  submission_id: string;
  unit_number: string;
  generated_subtotal: number;
  stored_subtotal: number;
  diff: number;
  windows_diff: number;
  line_count: number;
  status: 'ok' | 'drift' | 'no lines';
}

export interface AuditReport {
  audited: number;
  okCount: number;
  driftCount: number;
  noLinesCount: number;
  errorCount: number;
  rows: AuditRow[];
  errors: { submissionId: string; error: string }[];
}

export async function auditStoredVsGenerated(submissionId: string | null, deps: AuditDeps): Promise<AuditReport> {
  const subs = await deps.listSubmissions(submissionId);
  const pricing = await deps.loadPricing();
  const rows: AuditRow[] = [];
  const errors: AuditReport['errors'] = [];
  for (const sub of subs) {
    try {
      const stored = await deps.storedLines(sub.id);
      const generated = savedSubmissionLinesCore([], sub, pricing).lines;
      const c = compareStoredToGenerated(stored, generated);
      rows.push({
        submission_id: sub.id, unit_number: sub.unit_number,
        generated_subtotal: c.generated_subtotal, stored_subtotal: c.stored_subtotal,
        diff: c.diff, windows_diff: c.windows_diff, line_count: c.line_count,
        status: c.line_count === 0 ? 'no lines' : c.ok ? 'ok' : 'drift',
      });
    } catch (e) {
      errors.push({ submissionId: sub.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const count = (st: AuditRow['status']) => rows.filter((r) => r.status === st).length;
  return {
    audited: subs.length, okCount: count('ok'), driftCount: count('drift'), noLinesCount: count('no lines'),
    errorCount: errors.length, rows, errors,
  };
}
