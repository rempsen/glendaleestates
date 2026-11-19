-- Phase 2 Task 8 (fix round 1): staff-readable directory for the console's Flag-to picker.
-- user_roles RLS is admin-or-own, so a staff user could only see themselves. This SECURITY DEFINER function returns
-- admin/staff people to staff callers only (is_staff(auth.uid())); everyone else gets no rows.
CREATE OR REPLACE FUNCTION public.staff_directory()
RETURNS TABLE (user_id uuid, email text, first_name text, last_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.email, p.first_name, p.last_name, ur.role::text
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE ur.role::text IN ('admin', 'staff') AND public.is_staff(auth.uid())
  ORDER BY p.last_name, p.first_name
$$;

ALTER FUNCTION public.staff_directory() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.staff_directory() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.staff_directory() TO authenticated;
