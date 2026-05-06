// =====================================================================
// Fetches downstream tracking data (payments, ownership, line items)
// for one or many submissions. Returns lookup maps keyed by submission_id.
// =====================================================================

import { supabase } from '@/integrations/supabase/client';

export interface SubmissionPaymentRow {
  submission_id: string;
  deposit_required: boolean;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_date: string | null;
  balance_owing: number;
  invoice_number: string | null;
  payment_status: string;
  notes: string | null;
}

export interface SubmissionOwnershipRow {
  submission_id: string;
  designer_assigned: string | null;
  sales_rep: string | null;
  next_action: string | null;
  next_action_owner: string | null;
  due_date: string | null;
  risk_level: string;
  notes: string | null;
}

export interface SubmissionLineItemRow {
  submission_id: string;
  line_key: string;
  line_label: string | null;
  approval_status: string;
  supplier: string | null;
  sku: string | null;
  quantity_required: number | null;
  quantity_ordered: number | null;
  po_number: string | null;
  order_date: string | null;
  expected_delivery: string | null;
  received_date: string | null;
  storage_location: string | null;
  installation_status: string;
  risk_level: string;
  notes: string | null;
}

export interface DownstreamData {
  payments: Record<string, SubmissionPaymentRow>;
  ownership: Record<string, SubmissionOwnershipRow>;
  lineItems: Record<string, Record<string, SubmissionLineItemRow>>; // submission_id -> line_key -> row
}

export async function fetchDownstreamData(submissionIds: string[]): Promise<DownstreamData> {
  if (submissionIds.length === 0) {
    return { payments: {}, ownership: {}, lineItems: {} };
  }

  const [pay, own, li] = await Promise.all([
    supabase.from('submission_payments').select('*').in('submission_id', submissionIds),
    supabase.from('submission_ownership').select('*').in('submission_id', submissionIds),
    supabase.from('submission_line_items').select('*').in('submission_id', submissionIds),
  ]);

  const payments: DownstreamData['payments'] = {};
  (pay.data || []).forEach((r) => { payments[r.submission_id] = r as SubmissionPaymentRow; });

  const ownership: DownstreamData['ownership'] = {};
  (own.data || []).forEach((r) => { ownership[r.submission_id] = r as SubmissionOwnershipRow; });

  const lineItems: DownstreamData['lineItems'] = {};
  (li.data || []).forEach((r) => {
    const row = r as SubmissionLineItemRow;
    if (!lineItems[row.submission_id]) lineItems[row.submission_id] = {};
    lineItems[row.submission_id][row.line_key] = row;
  });

  return { payments, ownership, lineItems };
}
