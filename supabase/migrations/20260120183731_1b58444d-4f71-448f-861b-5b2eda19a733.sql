-- Create a table to store buyer selection drafts
CREATE TABLE public.buyer_selection_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  unit_number TEXT NOT NULL,
  current_step INTEGER DEFAULT 0,
  highest_step_reached INTEGER DEFAULT 0,
  selections JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, unit_number)
);

-- Enable RLS
ALTER TABLE public.buyer_selection_drafts ENABLE ROW LEVEL SECURITY;

-- Users can view their own drafts
CREATE POLICY "Users can view their own drafts"
ON public.buyer_selection_drafts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own drafts
CREATE POLICY "Users can insert their own drafts"
ON public.buyer_selection_drafts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own drafts
CREATE POLICY "Users can update their own drafts"
ON public.buyer_selection_drafts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can delete their own drafts
CREATE POLICY "Users can delete their own drafts"
ON public.buyer_selection_drafts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_buyer_selection_drafts_updated_at
BEFORE UPDATE ON public.buyer_selection_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();