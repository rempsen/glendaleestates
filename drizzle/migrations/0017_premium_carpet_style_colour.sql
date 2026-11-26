-- Premium carpet style + colour (Brian's review, 2026-11-26). A buyer who ticks "Upgrade to premium carpet" for the
-- bedrooms or for the stairs to the lower level now picks a Dream Weaver style (San Lucas 8623 / Valter 8655) and a
-- colour; the wizard stores the human-readable text, which the quote lines print as product name / colour.
-- Additive, nullable, no default, no backfill (rows submitted before this keep printing exactly as before).
-- Idempotent; safe to re-run. Apply BEFORE publishing the frontend/functions that write these columns.
ALTER TABLE public.buyer_selections
  ADD COLUMN IF NOT EXISTS premium_carpet_bedroom_style text,
  ADD COLUMN IF NOT EXISTS premium_carpet_bedroom_colour text,
  ADD COLUMN IF NOT EXISTS stair_premium_carpet_style text,
  ADD COLUMN IF NOT EXISTS stair_premium_carpet_colour text;
