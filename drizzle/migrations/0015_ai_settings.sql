-- Phase 2 Task 17 (spec §6.15): monthly token cap for summarize-upgrade-requests. Idempotent; safe to re-run.
-- ai_monthly_token_cap: prompt + completion tokens allowed per calendar month (UTC) across all AI summaries. The function
-- sums user_activity_logs rows with action_type 'ai_summary' (details.prompt_tokens + details.completion_tokens) before
-- every model call and answers 429 {error:'ai_monthly_cap_reached'} once the cap is reached. 0 turns summaries off.
-- Existing values are never overwritten. No table, policy or storage change: usage rows are inserted by the function's
-- service role into the existing user_activity_logs table (admin-readable under RLS).
INSERT INTO public.portal_settings (key, value) VALUES
  ('ai_monthly_token_cap', '2000000'::jsonb)
ON CONFLICT (key) DO NOTHING;
