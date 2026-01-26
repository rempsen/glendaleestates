-- Add unit_number column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN unit_number text;

-- Add index for faster lookups
CREATE INDEX idx_profiles_unit_number ON public.profiles(unit_number);