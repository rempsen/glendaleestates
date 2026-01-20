-- Create table for upgrade material configurations
CREATE TABLE public.upgrade_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  cost_per_unit numeric NOT NULL DEFAULT 0,
  unit_type text NOT NULL DEFAULT 'sqft' CHECK (unit_type IN ('sqft', 'sqyd', 'flat')),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  parent_material_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for pricing configuration (markup, GST, etc.)
CREATE TABLE public.pricing_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key text NOT NULL UNIQUE,
  config_value numeric NOT NULL,
  description text,
  is_percentage boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create table for additional line item costs
CREATE TABLE public.upgrade_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  cost numeric NOT NULL DEFAULT 0,
  cost_type text NOT NULL DEFAULT 'flat' CHECK (cost_type IN ('flat', 'per_unit', 'percentage')),
  apply_to_material_key text,
  blend_into_material boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.upgrade_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upgrade_line_items ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for upgrade_materials
CREATE POLICY "Admins can view upgrade materials"
ON public.upgrade_materials FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert upgrade materials"
ON public.upgrade_materials FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update upgrade materials"
ON public.upgrade_materials FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete upgrade materials"
ON public.upgrade_materials FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin-only policies for pricing_config
CREATE POLICY "Admins can view pricing config"
ON public.pricing_config FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pricing config"
ON public.pricing_config FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pricing config"
ON public.pricing_config FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pricing config"
ON public.pricing_config FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin-only policies for upgrade_line_items
CREATE POLICY "Admins can view upgrade line items"
ON public.upgrade_line_items FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert upgrade line items"
ON public.upgrade_line_items FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update upgrade line items"
ON public.upgrade_line_items FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete upgrade line items"
ON public.upgrade_line_items FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_upgrade_materials_updated_at
BEFORE UPDATE ON public.upgrade_materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pricing_config_updated_at
BEFORE UPDATE ON public.pricing_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_upgrade_line_items_updated_at
BEFORE UPDATE ON public.upgrade_line_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default pricing config
INSERT INTO public.pricing_config (config_key, config_value, description, is_percentage) VALUES
('markup_percentage', 60, 'Default markup percentage applied to all materials', true),
('gst_rate', 5, 'GST rate applied to final prices', true);

-- Insert default materials from current configuration
INSERT INTO public.upgrade_materials (material_key, name, description, cost_per_unit, unit_type, display_order) VALUES
('lvp', 'Premium LVP', 'Upgrade from standard to premium luxury vinyl plank', 4.00, 'sqft', 1),
('hardwood', 'Hardwood Flooring', 'Upgrade from LVP to premium hardwood flooring', 10.00, 'sqft', 2),
('carpet', 'Premium Carpet', 'Upgrade from standard to premium carpet', 20.00, 'sqyd', 3),
('tile', 'Premium Tile', 'Upgrade tile flooring or backsplash', 8.00, 'sqft', 4),
('backsplash_grout', 'Backsplash Grout Color', 'Change backsplash grout color', 300.00, 'flat', 5);