
-- Submission-level payment tracking (AR view)
CREATE TABLE public.submission_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL UNIQUE,
  deposit_required BOOLEAN NOT NULL DEFAULT false,
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  deposit_paid BOOLEAN NOT NULL DEFAULT false,
  deposit_paid_date DATE,
  balance_owing NUMERIC NOT NULL DEFAULT 0,
  invoice_number TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unbilled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.submission_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payments" ON public.submission_payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER set_submission_payments_updated_at
  BEFORE UPDATE ON public.submission_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Submission-level ownership / RACI
CREATE TABLE public.submission_ownership (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL UNIQUE,
  designer_assigned TEXT,
  sales_rep TEXT,
  next_action TEXT,
  next_action_owner TEXT,
  due_date DATE,
  risk_level TEXT NOT NULL DEFAULT 'green',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.submission_ownership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ownership" ON public.submission_ownership
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER set_submission_ownership_updated_at
  BEFORE UPDATE ON public.submission_ownership
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-line-item procurement, approval, and risk tracking
-- line_key uniquely identifies a line within a submission (e.g. area upgrade areaId,
-- or 'window_automation', 'bathroom_tile', 'grout', etc.)
CREATE TABLE public.submission_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL,
  line_key TEXT NOT NULL,
  line_label TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending_client_confirmation',
  supplier TEXT,
  sku TEXT,
  quantity_required NUMERIC,
  quantity_ordered NUMERIC,
  po_number TEXT,
  order_date DATE,
  expected_delivery DATE,
  received_date DATE,
  storage_location TEXT,
  installation_status TEXT NOT NULL DEFAULT 'not_started',
  risk_level TEXT NOT NULL DEFAULT 'green',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submission_id, line_key)
);
ALTER TABLE public.submission_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage line items" ON public.submission_line_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_submission_line_items_submission ON public.submission_line_items(submission_id);
CREATE TRIGGER set_submission_line_items_updated_at
  BEFORE UPDATE ON public.submission_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
