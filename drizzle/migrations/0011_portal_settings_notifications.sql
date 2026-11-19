-- Phase 2 Task 12 (spec §6.5–6.6): pricing-request notifications. Idempotent; safe to re-run.
-- 1. portal_settings keys edited at /admin/settings/notifications (existing values are never overwritten).
--    pricing_digest_recipients starts with Dan only; Brian's address is added in the settings page.
INSERT INTO public.portal_settings (key, value) VALUES
  ('teams_webhook_url', 'null'::jsonb),
  ('pricing_escalation_hours', '4'::jsonb),
  ('pricing_digest_recipients', '["dan@bmdmaterials.com"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. flagged_at is stamped by the database whenever flagged_to is set or changes (queue age, escalation and the
--    notify-pricing-request dedupe key all read it); answered_at / answered_by when a pending or under-review line
--    is answered (moves to included / upgrade / deferred).
CREATE OR REPLACE FUNCTION public.quote_lines_flag_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.flagged_to IS NULL THEN
    NEW.flagged_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.flagged_at := coalesce(NEW.flagged_at, now());
  ELSIF NEW.flagged_to IS DISTINCT FROM OLD.flagged_to THEN
    NEW.flagged_at := now();
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('pending', 'under_review')
     AND NEW.status IN ('included', 'upgrade', 'deferred') THEN
    NEW.answered_at := now();
    NEW.answered_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_lines_flag_stamp ON public.quote_lines;
CREATE TRIGGER quote_lines_flag_stamp BEFORE INSERT OR UPDATE ON public.quote_lines
FOR EACH ROW EXECUTE FUNCTION public.quote_lines_flag_stamp();

-- 3. One notification per flagging: notify-pricing-request claims its dedupe key (line:assignee:flagged_at) by
--    inserting a submission_audit_logs row; a re-delivered webhook hits this index and sends nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'submission_audit_logs_pricing_notify_key') THEN
    CREATE UNIQUE INDEX submission_audit_logs_pricing_notify_key
      ON public.submission_audit_logs ((changes ->> 'dedupe_key'))
      WHERE action_type = 'pricing_request_notified';
  END IF;
END
$$;
