-- Add window_comments column to buyer_selections table
ALTER TABLE public.buyer_selections 
ADD COLUMN window_comments text;

-- Update RLS policies for buyer_selections to be admin-only for SELECT
-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Users can view submissions by email" ON public.buyer_selections;

-- Add admin-only read policy  
CREATE POLICY "Admins can view all submissions"
ON public.buyer_selections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Add admin-only UPDATE policy for status changes
CREATE POLICY "Admins can update submissions"
ON public.buyer_selections
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);