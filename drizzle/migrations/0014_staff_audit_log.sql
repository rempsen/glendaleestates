-- Phase 2 Task 16 fix round 1 (spec §6.9): staff edits are audited. Idempotent; safe to re-run. Admin policies
-- ("Admins can view all audit logs", "Admins can insert audit logs") are left as they are.
-- 1. Staff read the audit trail (Submissions "Audit Log" / "Changes" tabs).
DROP POLICY IF EXISTS "Staff view audit logs" ON public.submission_audit_logs;
CREATE POLICY "Staff view audit logs" ON public.submission_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 2. Staff write their own audit rows (SubmissionEditor createAuditLog). Never as someone else, and never a
--    'pricing_request_notified' row: that is the 0011 dedupe claim, and a pre-inserted key would suppress a notification.
DROP POLICY IF EXISTS "Staff add audit logs" ON public.submission_audit_logs;
CREATE POLICY "Staff add audit logs" ON public.submission_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND changed_by_user_id = auth.uid() AND action_type <> 'pricing_request_notified');
