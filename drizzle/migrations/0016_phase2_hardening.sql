-- Phase 2 final fix wave (I3 + deferred T1 minors): signed records are not staff-mutable. Idempotent; safe to re-run.
-- The service role (send-for-signature claim / markSent, esign-webhook status + signed-PDF overwrite) bypasses RLS and
-- is unaffected. Never run from this repository's tests; applied by Dan after review (runbook §2).

-- 1. documents: staff read and add documents; they may only edit an unsigned (draft / sent) row, and may void one.
--    A signed / declined / voided row is final for staff. No staff DELETE (the console voids a failed draft instead).
DROP POLICY IF EXISTS "Staff manage documents" ON public.documents;

DROP POLICY IF EXISTS "Staff view documents" ON public.documents;
CREATE POLICY "Staff view documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff add documents" ON public.documents;
CREATE POLICY "Staff add documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update unsigned documents" ON public.documents;
CREATE POLICY "Staff update unsigned documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()) AND status IN ('draft', 'sent'))
  WITH CHECK (public.is_staff(auth.uid()) AND status IN ('draft', 'sent', 'voided'));

-- 2. storage unit-documents: staff upload new files and read them; no overwrite (UPDATE) or DELETE. The webhook's
--    signed-PDF overwrite runs as the service role.
DROP POLICY IF EXISTS "Staff manage unit documents" ON storage.objects;

DROP POLICY IF EXISTS "Staff view unit documents" ON storage.objects;
CREATE POLICY "Staff view unit documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff add unit documents" ON storage.objects;
CREATE POLICY "Staff add unit documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()));

-- 3. quote_line_reviews are the buyer's record: staff read them only. Buyers keep their own SELECT / INSERT (0006).
DROP POLICY IF EXISTS "Staff manage quote line reviews" ON public.quote_line_reviews;

DROP POLICY IF EXISTS "Staff view quote line reviews" ON public.quote_line_reviews;
CREATE POLICY "Staff view quote line reviews" ON public.quote_line_reviews
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 4. The two SECURITY DEFINER predicates are for signed-in callers (policies and RPCs) only.
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid), public.buyer_can_see_line(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_staff(uuid), public.buyer_can_see_line(uuid) TO authenticated;

-- 5. quote_lines.updated_by is stamped by the database on every update (request_quote_change's rep lookup reads it).
--    The client never writes it (FORBIDDEN_WRITE_KEYS); a service-role update keeps the value it sets.
CREATE OR REPLACE FUNCTION public.quote_lines_set_updated_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_lines_set_updated_by ON public.quote_lines;

CREATE TRIGGER quote_lines_set_updated_by BEFORE UPDATE ON public.quote_lines
FOR EACH ROW EXECUTE FUNCTION public.quote_lines_set_updated_by();
