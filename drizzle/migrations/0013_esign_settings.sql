-- Phase 2 Task 14 (spec §6.8): e-sign settings and the webhook's document lookup. Idempotent; safe to re-run.
-- Storage: the private bucket unit-documents and the "Staff manage unit documents" policy already exist (0006); no
-- storage change here. SignWell secrets are edge-function env (SIGNWELL_API_KEY, SIGNWELL_WEBHOOK_SECRET), never settings.
-- 1. esign_provider: which EsignProvider send-for-signature uses ("signwell"). esign_status_after_signed: the
--    buyer_selections.status the esign-webhook advances to once a document is signed. 'signed' is not a buyer_selections
--    status (workflow: submitted → reviewed → quoted → completed), so the default is "completed"; JSON null disables the
--    advance. The webhook only ever moves a status forward. Existing values are never overwritten.
INSERT INTO public.portal_settings (key, value) VALUES
  ('esign_provider', '"signwell"'::jsonb),
  ('esign_status_after_signed', '"completed"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. One portal document per provider document: the webhook finds the row by (provider, provider_envelope_id).
CREATE UNIQUE INDEX IF NOT EXISTS documents_provider_envelope_key
  ON public.documents (provider, provider_envelope_id)
  WHERE provider_envelope_id IS NOT NULL;
