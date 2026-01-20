-- Add flat-rate pricing items to pricing_config table
-- These are the window coverings, heated floors, and automation prices

-- Additional window covering price
INSERT INTO public.pricing_config (config_key, config_value, is_percentage, description)
VALUES ('additional_window_price', 673.50, false, 'Price per additional window covering (pre-GST)')
ON CONFLICT (config_key) DO NOTHING;

-- Patio door panel track price
INSERT INTO public.pricing_config (config_key, config_value, is_percentage, description)
VALUES ('patio_door_price', 2347.80, false, 'Price per patio door panel track covering (pre-GST)')
ON CONFLICT (config_key) DO NOTHING;

-- Somfy automation motor price
INSERT INTO public.pricing_config (config_key, config_value, is_percentage, description)
VALUES ('automated_motor_price', 495.00, false, 'Price per window for Somfy motor, hub, programming & installation (pre-GST)')
ON CONFLICT (config_key) DO NOTHING;

-- Heated floor per bathroom price
INSERT INTO public.pricing_config (config_key, config_value, is_percentage, description)
VALUES ('heated_floor_per_bathroom', 1650.00, false, 'Radiant floor heating per bathroom (pre-GST)')
ON CONFLICT (config_key) DO NOTHING;

-- Backsplash grout color change price  
INSERT INTO public.pricing_config (config_key, config_value, is_percentage, description)
VALUES ('grout_color_change_price', 300.00, false, 'Backsplash grout color change fee (pre-GST, no markup)')
ON CONFLICT (config_key) DO NOTHING;

-- Add unique constraint on config_key to prevent duplicates
ALTER TABLE public.pricing_config ADD CONSTRAINT pricing_config_config_key_unique UNIQUE (config_key);