-- Create table to store unit area data for pricing calculations
CREATE TABLE public.unit_area_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_type_code TEXT NOT NULL UNIQUE,
  unit_type_label TEXT NOT NULL,
  all_lvp NUMERIC NOT NULL DEFAULT 0,
  main_living NUMERIC NOT NULL DEFAULT 0,
  second_bedroom NUMERIC NOT NULL DEFAULT 0,
  master_bedroom NUMERIC NOT NULL DEFAULT 0,
  second_bedroom_carpet NUMERIC NOT NULL DEFAULT 0,
  guest_bathroom NUMERIC NOT NULL DEFAULT 0,
  master_ensuite NUMERIC NOT NULL DEFAULT 0,
  laundry NUMERIC NOT NULL DEFAULT 0,
  backsplash NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.unit_area_data ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admins can view unit area data" 
ON public.unit_area_data 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert unit area data" 
ON public.unit_area_data 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update unit area data" 
ON public.unit_area_data 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete unit area data" 
ON public.unit_area_data 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_unit_area_data_updated_at
BEFORE UPDATE ON public.unit_area_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial data from existing hardcoded values
INSERT INTO public.unit_area_data (unit_type_code, unit_type_label, all_lvp, main_living, second_bedroom, master_bedroom, second_bedroom_carpet, guest_bathroom, master_ensuite, laundry, backsplash, display_order) VALUES
  ('A', 'Unit Type A', 1350, 250, 200, 90, 20, 165, 80, 0, 30, 1),
  ('B', 'Unit Type B', 1150, 250, 180, 28, 20, 135, 75, 0, 25, 2),
  ('C', 'Unit Type C', 1500, 360, 200, 44, 24, 200, 80, 60, 25, 3),
  ('D', 'Unit Type D', 1500, 360, 200, 44, 24, 200, 80, 60, 25, 4),
  ('E', 'Unit Type E', 1050, 200, 180, 24, 22, 150, 60, 40, 25, 5),
  ('F', 'Unit Type F', 1050, 200, 180, 24, 22, 150, 60, 40, 25, 6),
  ('G-1', 'Unit Type G (1st Floor)', 700, 0, 0, 0, 0, 200, 50, 50, 25, 7),
  ('G-2', 'Unit Type G (2nd Floor)', 900, 0, 0, 120, 0, 0, 50, 0, 0, 8),
  ('H-1', 'Unit Type H (1st Floor)', 600, 0, 0, 0, 0, 190, 50, 40, 25, 9),
  ('H-2', 'Unit Type H (2nd Floor)', 675, 0, 0, 90, 0, 0, 50, 0, 0, 10),
  ('J', 'Unit Type J', 950, 200, 200, 25, 22, 190, 70, 60, 25, 11);