-- Drop existing policies on buyer_selections that don't use has_role()
DROP POLICY IF EXISTS "Admins can view all submissions" ON public.buyer_selections;
DROP POLICY IF EXISTS "Admins can update submissions" ON public.buyer_selections;

-- Recreate policies using the has_role() function for cleaner, more maintainable code
CREATE POLICY "Admins can view all submissions"
ON public.buyer_selections
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update submissions"
ON public.buyer_selections
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));