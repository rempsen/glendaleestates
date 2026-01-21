-- Add status workflow timestamps and admin notes columns to buyer_selections
ALTER TABLE public.buyer_selections
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Update status enum to include 'quoted' for proper workflow
-- (status is already a text field, so we can add new values)

-- Add index for possession date queries (calendar view)
CREATE INDEX IF NOT EXISTS idx_buyer_selections_possession_date 
  ON public.buyer_selections(estimated_possession_date);

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_buyer_selections_status 
  ON public.buyer_selections(status);

-- Add index for created_at queries (for alerts)
CREATE INDEX IF NOT EXISTS idx_buyer_selections_created_at 
  ON public.buyer_selections(created_at DESC);