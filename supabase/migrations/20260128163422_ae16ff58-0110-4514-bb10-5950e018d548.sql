-- Add master_bedroom_lvp column to unit_area_data table
ALTER TABLE public.unit_area_data 
ADD COLUMN master_bedroom_lvp numeric NOT NULL DEFAULT 0;

-- Update the existing unit data with Master Bedroom LVP values
UPDATE public.unit_area_data SET master_bedroom_lvp = 250 WHERE unit_type_code = 'A';
UPDATE public.unit_area_data SET master_bedroom_lvp = 250 WHERE unit_type_code = 'B';
UPDATE public.unit_area_data SET master_bedroom_lvp = 360 WHERE unit_type_code = 'C';
UPDATE public.unit_area_data SET master_bedroom_lvp = 360 WHERE unit_type_code = 'D';
UPDATE public.unit_area_data SET master_bedroom_lvp = 200 WHERE unit_type_code = 'E';
UPDATE public.unit_area_data SET master_bedroom_lvp = 200 WHERE unit_type_code = 'F';
UPDATE public.unit_area_data SET master_bedroom_lvp = 200 WHERE unit_type_code = 'J';

-- G and H units don't have Master Bedroom LVP (they have carpet on 2nd floor)
UPDATE public.unit_area_data SET master_bedroom_lvp = 0 WHERE unit_type_code IN ('G-1', 'G-2', 'H-1', 'H-2');