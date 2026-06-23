
CREATE TABLE public.warranty_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  notice_text text NOT NULL DEFAULT 'Garantia legal de 90 dias contra defeitos de fabricação, conforme o CDC.',
  message_template text NOT NULL DEFAULT 'A garantia não cobre danos por mau uso, quedas, exposição a líquidos, violação por terceiros ou desgaste natural. Para acionamento, é obrigatória a apresentação deste comprovante.',
  default_enabled boolean NOT NULL DEFAULT true,
  default_days integer NOT NULL DEFAULT 90,
  options jsonb NOT NULL DEFAULT '[{"days":30,"label":"30 dias"},{"days":90,"label":"90 dias (legal)"},{"days":180,"label":"6 meses"},{"days":365,"label":"1 ano"}]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranty_settings TO authenticated;
GRANT ALL ON public.warranty_settings TO service_role;

ALTER TABLE public.warranty_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranty_select_member" ON public.warranty_settings
  FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

CREATE POLICY "warranty_insert_admin" ON public.warranty_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner(auth.uid(), store_id)
    OR public.has_role(auth.uid(), store_id, 'administrador'::app_role)
    OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
  );

CREATE POLICY "warranty_update_admin" ON public.warranty_settings
  FOR UPDATE TO authenticated
  USING (
    public.is_owner(auth.uid(), store_id)
    OR public.has_role(auth.uid(), store_id, 'administrador'::app_role)
    OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)
  );

CREATE POLICY "warranty_delete_owner" ON public.warranty_settings
  FOR DELETE TO authenticated
  USING (public.is_owner(auth.uid(), store_id));

CREATE TRIGGER trg_warranty_updated_at
  BEFORE UPDATE ON public.warranty_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
