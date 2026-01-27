-- Allow authenticated users to read unit area data for accurate pricing in the wizard
CREATE POLICY "Authenticated users can view unit area data" 
ON public.unit_area_data 
FOR SELECT 
USING (auth.uid() IS NOT NULL);