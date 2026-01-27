-- Allow authenticated users to read upgrade materials for the wizard
CREATE POLICY "Authenticated users can view upgrade materials" 
ON public.upgrade_materials 
FOR SELECT 
USING (auth.uid() IS NOT NULL);