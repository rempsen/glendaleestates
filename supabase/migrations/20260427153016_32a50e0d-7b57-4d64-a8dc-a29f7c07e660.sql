ALTER TABLE public.buyer_selections
  ADD COLUMN IF NOT EXISTS upgrade_comments text,
  ADD COLUMN IF NOT EXISTS upgrade_interests_notes text;

COMMENT ON COLUMN public.buyer_selections.upgrade_comments IS 'Buyer comments entered in the Upgrade Pricing Summary step';
COMMENT ON COLUMN public.buyer_selections.upgrade_interests_notes IS 'Buyer notes entered in the Upgrade Interests step';