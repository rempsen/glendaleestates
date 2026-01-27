-- Add stair LVP upgrade tracking to buyer_selections
ALTER TABLE public.buyer_selections
ADD COLUMN stair_lvp_upgrade_selected boolean DEFAULT false;

-- Add pricing config for stair LVP upgrade
INSERT INTO public.pricing_config (config_key, config_value, description, is_percentage, is_active)
VALUES ('stair_lvp_upgrade_price', 2160.00, 'Stair LVP upgrade with custom flush nosings (replaces carpet)', false, true)
ON CONFLICT (config_key) DO UPDATE SET config_value = 2160.00, description = 'Stair LVP upgrade with custom flush nosings (replaces carpet)';