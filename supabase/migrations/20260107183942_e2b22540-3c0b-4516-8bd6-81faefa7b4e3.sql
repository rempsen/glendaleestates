-- Add tile upgrade fields to buyer_selections
ALTER TABLE public.buyer_selections
ADD COLUMN IF NOT EXISTS bathroom_tile_selected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS heated_floor_bathrooms integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS hardwood_upgrade_selected boolean DEFAULT false;