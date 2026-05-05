ALTER TABLE public.buyer_selections
ADD COLUMN IF NOT EXISTS bathroom_tile_ensuite_selected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS bathroom_tile_guest_selected boolean DEFAULT false;