CREATE TABLE IF NOT EXISTS public.portal_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view portal settings" ON public.portal_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert portal settings" ON public.portal_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update portal settings" ON public.portal_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.portal_settings (key, value)
VALUES (
  'internal_notification_recipients',
  '["dan@bmdmaterials.com","noni@bmdmaterials.com","brian@bmdmaterials.com","office@bmdmaterials.com","gregor.mckenzie@nvc360.com"]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
