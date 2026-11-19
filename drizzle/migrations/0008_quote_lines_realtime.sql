-- Phase 2: publish quote_lines to Supabase Realtime so useQuoteLines' postgres_changes subscription fires.
-- 0006 created the table but did not add it to the publication (0006 is already applied; do not edit it).
-- Idempotent: the DO block checks pg_publication_tables first, so a re-run is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'quote_lines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quote_lines;
  END IF;
END
$$;
