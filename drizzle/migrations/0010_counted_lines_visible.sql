-- Phase 2 Task 10 (fix round 1, controller ruling): counted ⇒ client_visible. A line that counts in the total
-- (status 'upgrade' with an amount) must be visible to the buyer, or the buyer's signed Total would silently differ
-- from the staff / email / QBO total. Hide-from-buyer is only for lines outside the total (pending, under review,
-- deferred, included). Idempotent. Fails if a violating row already exists; check first with:
--   SELECT id FROM public.quote_lines WHERE status = 'upgrade' AND amount IS NOT NULL AND client_visible = false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_lines_counted_visible') THEN
    ALTER TABLE public.quote_lines ADD CONSTRAINT quote_lines_counted_visible
      CHECK (NOT (status = 'upgrade' AND amount IS NOT NULL AND client_visible = false));
  END IF;
END
$$;
