-- Create submission_audit_logs table to track all changes to buyer_selections
CREATE TABLE public.submission_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL,
  changed_by_user_id UUID,
  changed_by_email TEXT,
  action_type TEXT NOT NULL DEFAULT 'update', -- 'create', 'update', 'delete', 'status_change'
  changes JSONB NOT NULL DEFAULT '{}',
  previous_values JSONB DEFAULT '{}',
  new_values JSONB DEFAULT '{}',
  change_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_submission_audit_logs_submission_id ON public.submission_audit_logs(submission_id);
CREATE INDEX idx_submission_audit_logs_created_at ON public.submission_audit_logs(created_at DESC);
CREATE INDEX idx_submission_audit_logs_changed_by ON public.submission_audit_logs(changed_by_user_id);

-- Enable RLS
ALTER TABLE public.submission_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all audit logs
CREATE POLICY "Admins can view all audit logs"
ON public.submission_audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert audit logs
CREATE POLICY "Admins can insert audit logs"
ON public.submission_audit_logs
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime for audit logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.submission_audit_logs;