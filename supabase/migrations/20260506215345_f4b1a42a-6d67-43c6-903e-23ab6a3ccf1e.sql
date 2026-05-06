
-- Single shared OAuth connection (only one active row)
CREATE TABLE public.qbo_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production','sandbox')),
  connected_by_user_id UUID,
  connected_by_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX qbo_connections_one_active
  ON public.qbo_connections (is_active) WHERE is_active = true;

ALTER TABLE public.qbo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage qbo connections"
  ON public.qbo_connections FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER qbo_connections_updated_at
  BEFORE UPDATE ON public.qbo_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Map portal entities <-> QBO IDs
CREATE TABLE public.qbo_entity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'customer','sub_customer','estimate','invoice','payment','item','purchase_order'
  )),
  portal_ref_type TEXT NOT NULL CHECK (portal_ref_type IN (
    'submission','line_item','submission_payment','material_color','supplier'
  )),
  portal_ref_id TEXT NOT NULL,
  qbo_id TEXT NOT NULL,
  qbo_sync_token TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, portal_ref_type, portal_ref_id)
);

CREATE INDEX qbo_entity_map_qbo_lookup ON public.qbo_entity_map (entity_type, qbo_id);

ALTER TABLE public.qbo_entity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage qbo entity map"
  ON public.qbo_entity_map FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER qbo_entity_map_updated_at
  BEFORE UPDATE ON public.qbo_entity_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trail
CREATE TABLE public.qbo_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  operation TEXT NOT NULL,
  entity_type TEXT,
  portal_ref_type TEXT,
  portal_ref_id TEXT,
  qbo_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  triggered_by_user_id UUID,
  triggered_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX qbo_sync_log_created_at ON public.qbo_sync_log (created_at DESC);
CREATE INDEX qbo_sync_log_portal_ref ON public.qbo_sync_log (portal_ref_type, portal_ref_id);

ALTER TABLE public.qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view qbo sync log"
  ON public.qbo_sync_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert qbo sync log"
  ON public.qbo_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Settings (single row enforced by app)
CREATE TABLE public.qbo_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_income_account_ref TEXT,
  default_income_account_name TEXT,
  default_ar_account_ref TEXT,
  default_ar_account_name TEXT,
  default_deposit_account_ref TEXT,
  default_deposit_account_name TEXT,
  default_tax_code_ref TEXT,
  default_tax_code_name TEXT,
  auto_create_items BOOLEAN NOT NULL DEFAULT true,
  item_sku_prefix TEXT NOT NULL DEFAULT 'GLEN-',
  customer_name_template TEXT NOT NULL DEFAULT '{last_name}, {first_name}',
  project_name_template TEXT NOT NULL DEFAULT 'Unit {unit_number}',
  webhook_verifier_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qbo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage qbo settings"
  ON public.qbo_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER qbo_settings_updated_at
  BEFORE UPDATE ON public.qbo_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed empty settings row
INSERT INTO public.qbo_settings (id) VALUES (gen_random_uuid());
