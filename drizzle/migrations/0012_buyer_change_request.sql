-- Phase 2 Task 13 (spec §6.7): buyer review page /my-quote. Idempotent; safe to re-run. Adds no policy: buyers still
-- have no SELECT on buyer_selections or quote_lines and no INSERT on quote_lines. Both functions match the caller by
-- auth.jwt() ->> 'email' (as get_my_quote_lines does) and act only on that buyer's newest submission.
-- 1. get_my_quote_header(): the caller's own identity fields for the page header and the buyer PDF / Word. Explicit
--    column list: no admin_notes, sales_comments, custom_pricing, area notes or comments.
CREATE OR REPLACE FUNCTION public.get_my_quote_header()
RETURNS TABLE (submission_id uuid, unit_number text, unit_type text, first_name text, last_name text, email text, phone_number text, estimated_possession_date date, status text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bs.id, bs.unit_number, bs.unit_type, bs.first_name, bs.last_name, bs.email, bs.phone_number,
         bs.estimated_possession_date, bs.status, bs.created_at
  FROM public.buyer_selections bs
  WHERE auth.uid() IS NOT NULL
    AND lower(bs.email) = lower(auth.jwt() ->> 'email')
  ORDER BY bs.created_at DESC, bs.id DESC
$$;

ALTER FUNCTION public.get_my_quote_header() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.get_my_quote_header() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_quote_header() TO authenticated;

-- 2. request_quote_change(_text): "Request a change" creates one pending buyer_request line on the caller's newest
--    submission, flagged to the unit's rep. buyer_selections has no assigned-rep column, so the rep is the staff member
--    who last edited a line of that submission (quote_lines.updated_by, else the quote_line_* audit log), else NULL
--    (the queue shows "Unassigned"). quote_lines_flag_stamp (0011) stamps flagged_at; quote_lines_audit logs the insert.
--    At most 20 open buyer requests per submission.
CREATE OR REPLACE FUNCTION public.request_quote_change(_text text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  _body text := btrim(coalesce(_text, ''));
  _submission uuid;
  _rep uuid;
  _sort integer;
  _id uuid;
BEGIN
  IF auth.uid() IS NULL OR _email IS NULL THEN
    RAISE EXCEPTION 'Sign in to request a change' USING ERRCODE = '28000';
  END IF;
  IF char_length(_body) < 1 OR char_length(_body) > 300 THEN
    RAISE EXCEPTION 'A change request must be 1 to 300 characters' USING ERRCODE = '22023';
  END IF;

  SELECT bs.id INTO _submission
  FROM public.buyer_selections bs
  WHERE lower(bs.email) = _email
  ORDER BY bs.created_at DESC, bs.id DESC
  LIMIT 1;
  IF _submission IS NULL THEN
    RAISE EXCEPTION 'No quote found for this sign-in' USING ERRCODE = 'P0002';
  END IF;

  IF (SELECT count(*) FROM public.quote_lines ql
      WHERE ql.submission_id = _submission AND ql.source = 'buyer_request' AND ql.status = 'pending') >= 20 THEN
    RAISE EXCEPTION 'Too many open change requests; please contact the office' USING ERRCODE = '54000';
  END IF;

  SELECT e.user_id INTO _rep
  FROM (
    SELECT ql.updated_by AS user_id, ql.updated_at AS edited_at
    FROM public.quote_lines ql
    WHERE ql.submission_id = _submission AND ql.updated_by IS NOT NULL
    UNION ALL
    SELECT al.changed_by_user_id, al.created_at
    FROM public.submission_audit_logs al
    WHERE al.submission_id = _submission
      AND al.action_type IN ('quote_line_insert', 'quote_line_update')
      AND al.changed_by_user_id IS NOT NULL
  ) e
  JOIN public.profiles p ON p.user_id = e.user_id
  WHERE public.is_staff(e.user_id)
  ORDER BY e.edited_at DESC
  LIMIT 1;

  SELECT coalesce(max(ql.sort_order), 0) + 1 INTO _sort FROM public.quote_lines ql WHERE ql.submission_id = _submission;

  INSERT INTO public.quote_lines (submission_id, sort_order, section, location, label, unit, pricing_mode, status, client_visible, client_note, source, flagged_to)
  VALUES (_submission, _sort, 'other', 'Buyer request', _body, 'flat', 'manual', 'pending', true, _body, 'buyer_request', _rep)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

ALTER FUNCTION public.request_quote_change(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.request_quote_change(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.request_quote_change(text) TO authenticated;

-- 3. Review comments are capped at 500 characters in the database as well as on the page (they feed the digest).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_line_reviews_comment_length') THEN
    ALTER TABLE public.quote_line_reviews ADD CONSTRAINT quote_line_reviews_comment_length
      CHECK (comment IS NULL OR char_length(comment) <= 500);
  END IF;
END
$$;
