ALTER TABLE public.buyer_selections
  ADD COLUMN IF NOT EXISTS automated_windows_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stair_premium_carpet_selected boolean NOT NULL DEFAULT false;