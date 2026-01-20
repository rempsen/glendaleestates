-- Create sales_pipeline table to track unit sales progress
CREATE TABLE public.sales_pipeline (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_number TEXT NOT NULL UNIQUE,
  unit_type TEXT,
  
  -- Contact info
  buyer_first_name TEXT,
  buyer_last_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  
  -- Pipeline stage: lead, meeting, quoted, signed
  pipeline_stage TEXT NOT NULL DEFAULT 'lead',
  
  -- Stage timestamps
  lead_date TIMESTAMP WITH TIME ZONE,
  meeting_date TIMESTAMP WITH TIME ZONE,
  quoted_date TIMESTAMP WITH TIME ZONE,
  signed_date TIMESTAMP WITH TIME ZONE,
  
  -- Financial tracking
  contract_signed BOOLEAN DEFAULT FALSE,
  deposit_received BOOLEAN DEFAULT FALSE,
  deposit_amount NUMERIC(12,2),
  deposit_date TIMESTAMP WITH TIME ZONE,
  contract_amount NUMERIC(12,2),
  tax_amount NUMERIC(12,2),
  total_amount NUMERIC(12,2),
  
  -- Selection summary (linked to buyer_selections)
  buyer_selection_id UUID REFERENCES public.buyer_selections(id),
  
  -- Notes and documents
  notes TEXT,
  hubspot_contact_id TEXT,
  hubspot_deal_id TEXT,
  documents_sent BOOLEAN DEFAULT FALSE,
  documents_signed BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_pipeline ENABLE ROW LEVEL SECURITY;

-- Admin-only access policies
CREATE POLICY "Admins can view all pipeline records"
ON public.sales_pipeline
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pipeline records"
ON public.sales_pipeline
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pipeline records"
ON public.sales_pipeline
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete pipeline records"
ON public.sales_pipeline
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_sales_pipeline_updated_at
BEFORE UPDATE ON public.sales_pipeline
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for common queries
CREATE INDEX idx_sales_pipeline_stage ON public.sales_pipeline(pipeline_stage);
CREATE INDEX idx_sales_pipeline_unit ON public.sales_pipeline(unit_number);