CREATE OR REPLACE FUNCTION public.guard_custom_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND NOT public.has_role(auth.uid(), 'admin')
     AND (TG_OP = 'INSERT' AND coalesce(NEW.custom_pricing, '{}'::jsonb) NOT IN ('{}'::jsonb, '{"overrides":{}}'::jsonb)
          OR TG_OP = 'UPDATE' AND NEW.custom_pricing IS DISTINCT FROM OLD.custom_pricing) THEN
    RAISE EXCEPTION 'Only BMD staff can change office pricing';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_custom_pricing_trg BEFORE INSERT OR UPDATE ON public.buyer_selections
FOR EACH ROW EXECUTE FUNCTION public.guard_custom_pricing();