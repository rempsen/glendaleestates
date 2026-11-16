CREATE OR REPLACE FUNCTION public.buyer_get_stair_addon()
RETURNS TABLE(id uuid, unit_number text, stair_upgrade_type text, stair_lvp_upgrade_selected boolean, stair_premium_carpet_selected boolean, premium_underpad_stairs boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.id, b.unit_number, b.stair_upgrade_type, b.stair_lvp_upgrade_selected, b.stair_premium_carpet_selected, b.premium_underpad_stairs
  FROM public.buyer_selections b
  WHERE auth.uid() IS NOT NULL
    AND lower(b.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  ORDER BY b.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.buyer_add_stair_addon(_premium_carpet boolean, _premium_underpad boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec public.buyer_selections%ROWTYPE;
  new_carpet boolean;
  new_underpad boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO rec FROM public.buyer_selections b
    WHERE lower(b.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    ORDER BY b.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No confirmed selection found'; END IF;
  IF coalesce(rec.stair_upgrade_type, 'standard') <> 'standard' OR coalesce(rec.stair_lvp_upgrade_selected, false) THEN
    RAISE EXCEPTION 'Stairs are already upgraded to LVP';
  END IF;
  new_carpet := coalesce(rec.stair_premium_carpet_selected, false) OR coalesce(_premium_carpet, false);
  new_underpad := coalesce(rec.premium_underpad_stairs, false) OR coalesce(_premium_underpad, false);
  IF new_carpet = coalesce(rec.stair_premium_carpet_selected, false) AND new_underpad = coalesce(rec.premium_underpad_stairs, false) THEN
    RETURN;
  END IF;
  UPDATE public.buyer_selections
    SET stair_premium_carpet_selected = new_carpet, premium_underpad_stairs = new_underpad
    WHERE id = rec.id;
  INSERT INTO public.submission_audit_logs (submission_id, changed_by_user_id, changed_by_email, action_type, changes, previous_values, new_values, change_summary)
  VALUES (rec.id, auth.uid(), auth.jwt() ->> 'email', 'update',
    jsonb_build_object('stair_premium_carpet_selected', jsonb_build_object('old', rec.stair_premium_carpet_selected, 'new', new_carpet),
                       'premium_underpad_stairs', jsonb_build_object('old', rec.premium_underpad_stairs, 'new', new_underpad)),
    jsonb_build_object('stair_premium_carpet_selected', rec.stair_premium_carpet_selected, 'premium_underpad_stairs', rec.premium_underpad_stairs),
    jsonb_build_object('stair_premium_carpet_selected', new_carpet, 'premium_underpad_stairs', new_underpad),
    'Buyer added stair (lower level) carpet upgrade after confirmation');
END;
$$;

REVOKE ALL ON FUNCTION public.buyer_get_stair_addon() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buyer_add_stair_addon(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buyer_get_stair_addon() TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_add_stair_addon(boolean, boolean) TO authenticated;