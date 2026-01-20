-- Add is_active column to pricing_config table for enabling/disabling flat rate items
ALTER TABLE public.pricing_config 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Update existing records to be active by default
UPDATE public.pricing_config SET is_active = true WHERE is_active IS NULL;