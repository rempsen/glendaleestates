-- Add sales_comments column to buyer_selections table
ALTER TABLE public.buyer_selections
ADD COLUMN sales_comments TEXT;