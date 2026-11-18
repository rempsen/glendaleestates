-- Phase 2: quote_lines system of record and companions (spec §6.1, §6.2, §6.5, §6.7, §6.8, §6.9).
-- The new enum value is added first and never referenced as an enum literal in this
-- migration (ALTER TYPE … ADD VALUE cannot be used in the same transaction on some Postgres versions).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- Staff-or-admin predicate. Compares role::text so the new enum literal is never dereferenced.
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'staff')
  )
$$;
ALTER FUNCTION public.is_staff(uuid) OWNER TO postgres;

-- §6.1 quote_lines: one row per thing on the quote.
CREATE TABLE IF NOT EXISTS public.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.buyer_selections(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  section text NOT NULL,
  location text,
  label text NOT NULL,
  product_name text,
  product_colour text,
  material_key text,
  quantity numeric,
  unit text,
  unit_price numeric,
  amount numeric,
  pricing_mode text NOT NULL DEFAULT 'manual',
  price_source_ref text,
  status text NOT NULL DEFAULT 'upgrade',
  counts_in_total boolean GENERATED ALWAYS AS (status = 'upgrade' AND amount IS NOT NULL) STORED,
  client_visible boolean NOT NULL DEFAULT true,
  client_note text,
  internal_note text,
  source text NOT NULL DEFAULT 'office',
  flagged_to uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  flagged_at timestamptz,
  answered_by uuid,
  answered_at timestamptz,
  provisional boolean NOT NULL DEFAULT false,
  wizard_field text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_lines_section_check CHECK (section IN ('standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other')),
  CONSTRAINT quote_lines_unit_check CHECK (unit IN ('sqft', 'sqyd', 'each', 'flat')),
  CONSTRAINT quote_lines_pricing_mode_check CHECK (pricing_mode IN ('catalog', 'flat_rate', 'manual', 'included')),
  CONSTRAINT quote_lines_status_check CHECK (status IN ('included', 'upgrade', 'pending', 'under_review', 'deferred', 'removed')),
  CONSTRAINT quote_lines_source_check CHECK (source IN ('wizard', 'office', 'buyer_request', 'migration'))
);

CREATE INDEX IF NOT EXISTS quote_lines_submission_idx ON public.quote_lines (submission_id, sort_order);
CREATE INDEX IF NOT EXISTS quote_lines_pending_flagged_idx ON public.quote_lines (flagged_to, flagged_at) WHERE status = 'pending';

-- §6.2 unit_base_spec: standard inclusions per unit type.
CREATE TABLE IF NOT EXISTS public.unit_base_spec (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_type_code text NOT NULL,
  section text NOT NULL,
  location text,
  label text NOT NULL,
  default_product text,
  default_colour_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_base_spec_section_check CHECK (section IN ('standard', 'flooring', 'tile', 'backsplash', 'stairs', 'window_coverings', 'bathroom', 'basement', 'other'))
);

CREATE INDEX IF NOT EXISTS unit_base_spec_unit_type_idx ON public.unit_base_spec (unit_type_code);

-- §6.7 quote_line_reviews: buyer Accept / Question / Comment per line.
CREATE TABLE IF NOT EXISTS public.quote_line_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.quote_lines(id) ON DELETE RESTRICT,
  buyer_user_id uuid NOT NULL,
  response text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_line_reviews_response_check CHECK (response IN ('accepted', 'questioned'))
);

CREATE INDEX IF NOT EXISTS quote_line_reviews_line_idx ON public.quote_line_reviews (line_id, created_at DESC);

-- §6.8 quote_snapshots: immutable copy of what was shown or signed (trigger below).
-- Every FK in this migration is ON DELETE RESTRICT: lines are retired with status = 'removed', not deleted.
CREATE TABLE IF NOT EXISTS public.quote_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.buyer_selections(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  lines jsonb NOT NULL,
  subtotal numeric NOT NULL,
  gst numeric NOT NULL,
  total numeric NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  purpose text NOT NULL DEFAULT 'quote',
  CONSTRAINT quote_snapshots_purpose_check CHECK (purpose IN ('quote', 'change_order', 'contract')),
  CONSTRAINT quote_snapshots_version_unique UNIQUE (submission_id, version)
);

-- §6.8 documents: files in private bucket unit-documents/{unit_number}/{document_id}.pdf.
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.buyer_selections(id) ON DELETE RESTRICT,
  snapshot_id uuid REFERENCES public.quote_snapshots(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  storage_path text,
  provider text,
  provider_envelope_id text,
  status text NOT NULL DEFAULT 'draft',
  signed_at timestamptz,
  signer_email text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_kind_check CHECK (kind IN ('selection_sheet', 'change_order', 'purchase_agreement', 'deposit_receipt', 'other')),
  CONSTRAINT documents_status_check CHECK (status IN ('draft', 'sent', 'signed', 'declined', 'voided'))
);

CREATE INDEX IF NOT EXISTS documents_submission_idx ON public.documents (submission_id);

-- §6.8 snapshots are immutable for everyone (no admin escape hatch).
CREATE OR REPLACE FUNCTION public.quote_snapshots_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'quote_snapshots are immutable';
END;
$$;

DROP TRIGGER IF EXISTS quote_snapshots_immutable ON public.quote_snapshots;
CREATE TRIGGER quote_snapshots_immutable BEFORE UPDATE OR DELETE ON public.quote_snapshots
FOR EACH ROW EXECUTE FUNCTION public.quote_snapshots_immutable();

-- updated_at maintenance (reuses the project's existing update_updated_at_column()).
DROP TRIGGER IF EXISTS set_updated_at ON public.quote_lines;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.quote_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.documents;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- §6.5 audit: every quote_lines change writes one submission_audit_logs row.
-- SECURITY DEFINER (owner postgres) because submission_audit_logs only accepts admin inserts under RLS,
-- and staff edits must still be audited. internal_note never enters `changes` (it feeds AI prompts);
-- only internal_note_changed is recorded. UPDATE logs only the keys that changed (updated_at ignored)
-- and logs nothing when nothing changed.
CREATE OR REPLACE FUNCTION public.quote_lines_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb;
  n jsonb;
  d_old jsonb := '{}'::jsonb;
  d_new jsonb := '{}'::jsonb;
  k text;
  note_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    d_old := NULL;
    d_new := to_jsonb(NEW) - 'internal_note';
    note_changed := NEW.internal_note IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    d_old := to_jsonb(OLD) - 'internal_note';
    d_new := NULL;
    note_changed := OLD.internal_note IS NOT NULL;
  ELSE
    o := to_jsonb(OLD) - 'internal_note';
    n := to_jsonb(NEW) - 'internal_note';
    note_changed := OLD.internal_note IS DISTINCT FROM NEW.internal_note;
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k <> 'updated_at' AND (o -> k) IS DISTINCT FROM (n -> k) THEN
        d_old := d_old || jsonb_build_object(k, o -> k);
        d_new := d_new || jsonb_build_object(k, n -> k);
      END IF;
    END LOOP;
    IF d_new = '{}'::jsonb AND NOT note_changed THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.submission_audit_logs (submission_id, changed_by_user_id, changed_by_email, action_type, changes, change_summary)
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.submission_id ELSE NEW.submission_id END,
    auth.uid(),
    auth.jwt() ->> 'email',
    CASE TG_OP WHEN 'INSERT' THEN 'quote_line_insert' WHEN 'UPDATE' THEN 'quote_line_update' ELSE 'quote_line_delete' END,
    jsonb_build_object(
      'line_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
      'old', d_old,
      'new', d_new,
      'internal_note_changed', note_changed
    ),
    'Quote line ' || lower(TG_OP)
  );
  RETURN NULL;
END;
$$;
ALTER FUNCTION public.quote_lines_audit() OWNER TO postgres;

DROP TRIGGER IF EXISTS quote_lines_audit ON public.quote_lines;
CREATE TRIGGER quote_lines_audit AFTER INSERT OR UPDATE OR DELETE ON public.quote_lines
FOR EACH ROW EXECUTE FUNCTION public.quote_lines_audit();

-- §6.9 staff may change office pricing too.
CREATE OR REPLACE FUNCTION public.guard_custom_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND NOT public.is_staff(auth.uid())
     AND (TG_OP = 'INSERT' AND coalesce(NEW.custom_pricing, '{}'::jsonb) NOT IN ('{}'::jsonb, '{"overrides":{}}'::jsonb)
          OR TG_OP = 'UPDATE' AND NEW.custom_pricing IS DISTINCT FROM OLD.custom_pricing) THEN
    RAISE EXCEPTION 'Only BMD staff can change office pricing';
  END IF;
  RETURN NEW;
END;
$$;

-- §6.5 pricing_queue: open pending lines with an assignee, staff only. RLS of the base tables applies
-- (staff SELECT on buyer_selections and profiles is added below).
CREATE OR REPLACE VIEW public.pricing_queue WITH (security_invoker = true) AS
SELECT
  ql.id AS line_id,
  ql.submission_id,
  bs.unit_number,
  bs.first_name,
  bs.last_name,
  bs.email,
  ql.section,
  ql.location,
  ql.label,
  ql.internal_note,
  ql.flagged_to,
  p.email AS assignee_email,
  p.first_name AS assignee_first_name,
  p.last_name AS assignee_last_name,
  ql.flagged_at,
  (extract(epoch FROM (now() - ql.flagged_at)) / 3600)::numeric AS age_hours
FROM public.quote_lines ql
JOIN public.buyer_selections bs ON bs.id = ql.submission_id
LEFT JOIN public.profiles p ON p.user_id = ql.flagged_to
WHERE ql.status = 'pending' AND ql.flagged_to IS NOT NULL AND public.is_staff(auth.uid());

GRANT SELECT ON public.pricing_queue TO authenticated;

-- §6.7 buyer access goes through definer functions that expose buyer-safe columns only;
-- buyers have no SELECT policy on the quote_lines base table.
CREATE OR REPLACE FUNCTION public.get_my_quote_lines()
RETURNS TABLE (id uuid, submission_id uuid, section text, location text, label text, product_name text, product_colour text, quantity numeric, unit text, unit_price numeric, amount numeric, status text, client_note text, provisional boolean, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ql.id, ql.submission_id, ql.section, ql.location, ql.label, ql.product_name, ql.product_colour,
         ql.quantity, ql.unit, ql.unit_price, ql.amount, ql.status, ql.client_note, ql.provisional, ql.sort_order
  FROM public.quote_lines ql
  JOIN public.buyer_selections bs ON bs.id = ql.submission_id
  WHERE ql.client_visible
    AND ql.status <> 'removed'
    AND lower(bs.email) = lower(auth.jwt() ->> 'email')
  ORDER BY ql.submission_id, ql.sort_order, ql.id
$$;
ALTER FUNCTION public.get_my_quote_lines() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_my_quote_lines() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_quote_lines() TO authenticated;

CREATE OR REPLACE FUNCTION public.buyer_can_see_line(_line_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quote_lines ql
    JOIN public.buyer_selections bs ON bs.id = ql.submission_id
    WHERE ql.id = _line_id
      AND ql.client_visible
      AND ql.status <> 'removed'
      AND lower(bs.email) = lower(auth.jwt() ->> 'email')
  )
$$;
ALTER FUNCTION public.buyer_can_see_line(uuid) OWNER TO postgres;

-- RLS
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_base_spec ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Superseded policy names from earlier drafts of this migration.
DROP POLICY IF EXISTS "Staff manage quote lines" ON public.quote_lines;
DROP POLICY IF EXISTS "Buyers view own visible quote lines" ON public.quote_lines;
DROP POLICY IF EXISTS "Staff manage quote snapshots" ON public.quote_snapshots;

DROP POLICY IF EXISTS "Staff view quote lines" ON public.quote_lines;
CREATE POLICY "Staff view quote lines" ON public.quote_lines
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff add quote lines" ON public.quote_lines;
CREATE POLICY "Staff add quote lines" ON public.quote_lines
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update quote lines" ON public.quote_lines;
CREATE POLICY "Staff update quote lines" ON public.quote_lines
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Hard deletes are admin-only; staff retire a line with status = 'removed' (spec §6.1).
DROP POLICY IF EXISTS "Admins delete quote lines" ON public.quote_lines;
CREATE POLICY "Admins delete quote lines" ON public.quote_lines
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated view unit base spec" ON public.unit_base_spec;
CREATE POLICY "Authenticated view unit base spec" ON public.unit_base_spec
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage unit base spec" ON public.unit_base_spec;
CREATE POLICY "Admins manage unit base spec" ON public.unit_base_spec
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Staff manage quote line reviews" ON public.quote_line_reviews;
CREATE POLICY "Staff manage quote line reviews" ON public.quote_line_reviews
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Buyers view own quote line reviews" ON public.quote_line_reviews;
CREATE POLICY "Buyers view own quote line reviews" ON public.quote_line_reviews
  FOR SELECT TO authenticated
  USING (buyer_user_id = auth.uid() AND public.buyer_can_see_line(line_id));

DROP POLICY IF EXISTS "Buyers add own quote line reviews" ON public.quote_line_reviews;
CREATE POLICY "Buyers add own quote line reviews" ON public.quote_line_reviews
  FOR INSERT TO authenticated
  WITH CHECK (buyer_user_id = auth.uid() AND public.buyer_can_see_line(line_id));

DROP POLICY IF EXISTS "Staff view quote snapshots" ON public.quote_snapshots;
CREATE POLICY "Staff view quote snapshots" ON public.quote_snapshots
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff add quote snapshots" ON public.quote_snapshots;
CREATE POLICY "Staff add quote snapshots" ON public.quote_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage documents" ON public.documents;
CREATE POLICY "Staff manage documents" ON public.documents
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- §6.9 staff read all submissions and profiles (pricing_queue joins them) and edit submissions.
DROP POLICY IF EXISTS "Staff view all submissions" ON public.buyer_selections;
CREATE POLICY "Staff view all submissions" ON public.buyer_selections
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff update submissions" ON public.buyer_selections;
CREATE POLICY "Staff update submissions" ON public.buyer_selections
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff view all profiles" ON public.profiles;
CREATE POLICY "Staff view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Private bucket for unit documents; staff only for now (no buyer access).
insert into storage.buckets (id, name, public) values ('unit-documents', 'unit-documents', false) on conflict do nothing;

DROP POLICY IF EXISTS "Staff manage unit documents" ON storage.objects;
CREATE POLICY "Staff manage unit documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'unit-documents' AND public.is_staff(auth.uid()));
