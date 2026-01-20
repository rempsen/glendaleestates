-- Add RLS policy to allow admins to delete buyer_selections
CREATE POLICY "Admins can delete submissions" 
ON public.buyer_selections 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));