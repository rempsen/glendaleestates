-- Suppliers (admin-managed list)
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage suppliers"
ON public.suppliers FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Area type on line items for aggregation grouping
ALTER TABLE public.submission_line_items
ADD COLUMN IF NOT EXISTS area_type TEXT,
ADD COLUMN IF NOT EXISTS material_key TEXT,
ADD COLUMN IF NOT EXISTS color_name TEXT,
ADD COLUMN IF NOT EXISTS unit_of_measure TEXT;

CREATE INDEX IF NOT EXISTS idx_line_items_area_type ON public.submission_line_items(area_type);
CREATE INDEX IF NOT EXISTS idx_line_items_supplier ON public.submission_line_items(supplier);
CREATE INDEX IF NOT EXISTS idx_line_items_material ON public.submission_line_items(material_key);
