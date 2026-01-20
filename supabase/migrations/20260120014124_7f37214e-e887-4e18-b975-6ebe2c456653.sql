-- Add new columns for area-based upgrades and backsplash grout selection
ALTER TABLE public.buyer_selections
ADD COLUMN IF NOT EXISTS area_upgrades jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS upgrade_floor_selection text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS backsplash_grout_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS backsplash_grout_color text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS backsplash_grout_comments text DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.buyer_selections.area_upgrades IS 'JSON array of area upgrade selections with areaId, materialType, productName, productColor, and comments';
COMMENT ON COLUMN public.buyer_selections.upgrade_floor_selection IS 'For G/H units, stores which floor (1 or 2) the upgrades apply to';
COMMENT ON COLUMN public.buyer_selections.backsplash_grout_enabled IS 'Whether buyer wants custom grout color';
COMMENT ON COLUMN public.buyer_selections.backsplash_grout_color IS 'Custom grout color name';
COMMENT ON COLUMN public.buyer_selections.backsplash_grout_comments IS 'Comments about grout selection';