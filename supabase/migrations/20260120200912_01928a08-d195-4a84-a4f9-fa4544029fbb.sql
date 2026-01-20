-- Fix: Require authentication for buyer_selections inserts
-- This prevents unauthenticated users from submitting unlimited data directly via Supabase REST API

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can submit selections" ON public.buyer_selections;

-- Create a new policy requiring authentication
CREATE POLICY "Authenticated users can submit selections"
ON public.buyer_selections
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);