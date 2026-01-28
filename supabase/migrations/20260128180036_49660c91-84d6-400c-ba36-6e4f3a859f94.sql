-- Create storage bucket for buyer document uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('buyer-documents', 'buyer-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own documents
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'buyer-documents' AND 
  auth.uid() IS NOT NULL
);

-- Allow authenticated users to view their own documents
CREATE POLICY "Authenticated users can view documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'buyer-documents' AND 
  auth.uid() IS NOT NULL
);

-- Allow admins to view all buyer documents
CREATE POLICY "Admins can view all buyer documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'buyer-documents' AND 
  public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete buyer documents
CREATE POLICY "Admins can delete buyer documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'buyer-documents' AND 
  public.has_role(auth.uid(), 'admin')
);

-- Add column to buyer_selections for storing document references
ALTER TABLE public.buyer_selections
ADD COLUMN IF NOT EXISTS document_uploads jsonb DEFAULT '[]'::jsonb;