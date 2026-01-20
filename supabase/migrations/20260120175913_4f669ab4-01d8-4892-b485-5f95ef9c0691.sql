-- Create user activity logs table
CREATE TABLE public.user_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_user_id UUID,
  target_user_email TEXT,
  performed_by_user_id UUID,
  performed_by_email TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view activity logs
CREATE POLICY "Admins can view all activity logs"
ON public.user_activity_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Allow edge functions with service role to insert logs
CREATE POLICY "Service role can insert activity logs"
ON public.user_activity_logs
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_activity_logs_created_at ON public.user_activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_action_type ON public.user_activity_logs(action_type);
CREATE INDEX idx_activity_logs_target_user ON public.user_activity_logs(target_user_id);