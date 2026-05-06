
-- 1. Unique index for qbo_entity_map upserts
CREATE UNIQUE INDEX IF NOT EXISTS qbo_entity_map_unique
  ON public.qbo_entity_map (entity_type, portal_ref_type, portal_ref_id);

-- 2. Ensure pg_net is available for async HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Trigger function: on status -> 'quoted', POST submission_id to qbo-sync-submission
CREATE OR REPLACE FUNCTION public.trigger_qbo_auto_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text;
  service_key text;
BEGIN
  IF NEW.status = 'quoted' AND (OLD.status IS DISTINCT FROM 'quoted') THEN
    -- Read project URL + service role key from Vault. If not present, just no-op so the
    -- status update never fails because of QBO.
    BEGIN
      SELECT decrypted_secret INTO fn_url
        FROM vault.decrypted_secrets WHERE name = 'project_url';
      SELECT decrypted_secret INTO service_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key';
    EXCEPTION WHEN OTHERS THEN
      fn_url := NULL;
    END;

    IF fn_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM extensions.http_post(
        url := fn_url || '/functions/v1/qbo-sync-submission',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', service_key,
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object('submission_id', NEW.id::text)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS buyer_selections_qbo_auto_sync ON public.buyer_selections;
CREATE TRIGGER buyer_selections_qbo_auto_sync
AFTER UPDATE OF status ON public.buyer_selections
FOR EACH ROW
EXECUTE FUNCTION public.trigger_qbo_auto_sync();
