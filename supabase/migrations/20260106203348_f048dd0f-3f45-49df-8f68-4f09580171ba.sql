-- Create a table to store buyer material selections
CREATE TABLE public.buyer_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Buyer Info
  unit_number TEXT NOT NULL,
  unit_type TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT NOT NULL,
  estimated_possession_date DATE,
  has_stairs BOOLEAN DEFAULT false,
  
  -- Flooring Selections
  lvp_colour TEXT,
  lvp_comments TEXT,
  spc_tile_colour TEXT,
  spc_tile_comments TEXT,
  backsplash_orientation TEXT,
  stair_carpet_colour TEXT,
  bedroom_flooring_choice TEXT,
  bedroom_carpet_colour TEXT,
  bedroom_lvp_colour TEXT,
  bedroom_lvp_same_as_main BOOLEAN DEFAULT true,
  
  -- Window Coverings
  additional_windows_qty INTEGER DEFAULT 0,
  patio_doors_qty INTEGER DEFAULT 0,
  window_total NUMERIC(10,2) DEFAULT 0,
  
  -- Upgrade Interests (stored as JSONB)
  upgrade_interests JSONB DEFAULT '{}',
  
  -- Floor Plan Annotations (stored as JSONB array)
  floor_plan_annotations JSONB DEFAULT '[]',
  
  -- Submission Status
  status TEXT DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'reviewed', 'completed'))
);

-- Enable Row Level Security
ALTER TABLE public.buyer_selections ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anyone to insert (public form submission)
CREATE POLICY "Anyone can submit selections" 
ON public.buyer_selections 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow reading own submissions by email
CREATE POLICY "Users can view submissions by email" 
ON public.buyer_selections 
FOR SELECT 
USING (true);

-- Create index for faster lookups
CREATE INDEX idx_buyer_selections_unit ON public.buyer_selections(unit_number);
CREATE INDEX idx_buyer_selections_email ON public.buyer_selections(email);
CREATE INDEX idx_buyer_selections_created ON public.buyer_selections(created_at DESC);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_buyer_selections_updated_at
BEFORE UPDATE ON public.buyer_selections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();