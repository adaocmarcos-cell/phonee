
-- ============ sale_payments ============
CREATE TABLE public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  method text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  installments int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sale_payments_sale ON public.sale_payments(sale_id);
CREATE INDEX idx_sale_payments_store_method ON public.sale_payments(store_id, method);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store members read sale_payments"
  ON public.sale_payments FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "store members insert sale_payments"
  ON public.sale_payments FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "store members update sale_payments"
  ON public.sale_payments FOR UPDATE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id))
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "store members delete sale_payments"
  ON public.sale_payments FOR DELETE TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));

-- ============ page_visits ============
CREATE TABLE public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  user_id uuid,
  session_id text,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_page_visits_path_time ON public.page_visits(path, created_at DESC);
CREATE INDEX idx_page_visits_time ON public.page_visits(created_at DESC);

GRANT SELECT ON public.page_visits TO authenticated;
GRANT INSERT ON public.page_visits TO anon, authenticated;
GRANT ALL ON public.page_visits TO service_role;

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log a page visit"
  ON public.page_visits FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "admin master reads page visits"
  ON public.page_visits FOR SELECT TO authenticated
  USING (public.is_admin_master(auth.uid()));

-- ============ marketing_settings ============
CREATE TABLE public.marketing_settings (
  id int PRIMARY KEY DEFAULT 1,
  meta_pixel_id text,
  meta_access_token text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_settings_singleton CHECK (id = 1)
);
INSERT INTO public.marketing_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.marketing_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.marketing_settings TO authenticated;
GRANT ALL ON public.marketing_settings TO service_role;

ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;

-- Public read of pixel id (needed to load Meta Pixel for visitors)
CREATE POLICY "public read pixel id"
  ON public.marketing_settings FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "admin master updates marketing"
  ON public.marketing_settings FOR UPDATE TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY "admin master inserts marketing"
  ON public.marketing_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_master(auth.uid()));

CREATE TRIGGER trg_marketing_settings_updated
  BEFORE UPDATE ON public.marketing_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Hide token from anon (column-level): revoke select on token column from anon
REVOKE SELECT ON public.marketing_settings FROM anon;
GRANT SELECT (id, meta_pixel_id, updated_at) ON public.marketing_settings TO anon;

-- ============ traffic RPC ============
CREATE OR REPLACE FUNCTION public.mobileplus_sales_traffic(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint; v_unique bigint; v_today bigint;
  v_by_day jsonb; v_by_path jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_total FROM public.page_visits
    WHERE created_at >= now() - (_days || ' days')::interval;

  SELECT count(DISTINCT COALESCE(session_id, id::text)) INTO v_unique
    FROM public.page_visits WHERE created_at >= now() - (_days || ' days')::interval;

  SELECT count(*) INTO v_today FROM public.page_visits
    WHERE created_at >= date_trunc('day', now());

  SELECT jsonb_agg(jsonb_build_object('day', d, 'visits', c) ORDER BY d) INTO v_by_day FROM (
    SELECT date_trunc('day', created_at)::date AS d, count(*) AS c
    FROM public.page_visits
    WHERE created_at >= now() - (_days || ' days')::interval
    GROUP BY 1 ORDER BY 1
  ) t;

  SELECT jsonb_agg(jsonb_build_object('path', path, 'visits', c) ORDER BY c DESC) INTO v_by_path FROM (
    SELECT path, count(*) AS c
    FROM public.page_visits
    WHERE created_at >= now() - (_days || ' days')::interval
    GROUP BY 1 ORDER BY c DESC LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'unique_sessions', v_unique,
    'today', v_today,
    'by_day', COALESCE(v_by_day, '[]'::jsonb),
    'by_path', COALESCE(v_by_path, '[]'::jsonb)
  );
END $$;
