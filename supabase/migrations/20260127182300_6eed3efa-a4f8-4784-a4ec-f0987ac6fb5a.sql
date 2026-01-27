-- Allow all authenticated users to read pricing config (needed for buyer wizard to display prices)
CREATE POLICY "Authenticated users can view pricing config" 
ON public.pricing_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);