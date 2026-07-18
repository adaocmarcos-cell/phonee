-- 1) Colunas de bloqueio na loja
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS access_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS stores_access_blocked_idx
  ON public.stores(access_blocked) WHERE access_blocked = true;

-- 2) Trigger: só admin_master (ou operações internas sem auth.uid()) podem tocar nas colunas de bloqueio
CREATE OR REPLACE FUNCTION public.enforce_access_blocked_admin_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(NEW.access_blocked, false) IS DISTINCT FROM COALESCE(OLD.access_blocked, false)
      OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
      OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by) THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_master(auth.uid()) THEN
      RAISE EXCEPTION 'Somente o administrador master pode alterar o bloqueio da loja.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_access_blocked_admin ON public.stores;
CREATE TRIGGER trg_enforce_access_blocked_admin
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.enforce_access_blocked_admin_only();

-- 3) Política extra: admin_master pode atualizar qualquer loja
DROP POLICY IF EXISTS "stores_admin_master_update" ON public.stores;
CREATE POLICY "stores_admin_master_update" ON public.stores
  FOR UPDATE TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

-- 4) Bloqueio efetivo: as funções centrais de RLS retornam falso quando a loja está bloqueada.
--    Toda política do app usa has_role / user_has_store_access, então isso corta leitura e escrita
--    em todas as tabelas ligadas a uma loja bloqueada.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _store_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.stores s ON s.id = ur.store_id
    WHERE ur.user_id = _user_id
      AND ur.store_id = _store_id
      AND ur.role = _role
      AND s.access_blocked = false
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_store_access(_user_id uuid, _store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_stores us
    JOIN public.stores s ON s.id = us.store_id
    WHERE us.user_id = _user_id
      AND us.store_id = _store_id
      AND s.access_blocked = false
  );
$$;

-- is_owner NÃO é filtrado por bloqueio, pois é usado para permitir que o dono
-- ainda enxergue o registro da própria loja (necessário para exibir a tela de bloqueio).

-- 5) RPC para o Admin Master alternar o bloqueio
CREATE OR REPLACE FUNCTION public.phonee_set_store_blocked(_store_id uuid, _blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;
  UPDATE public.stores
     SET access_blocked = _blocked,
         blocked_at     = CASE WHEN _blocked THEN now() ELSE NULL END,
         blocked_by     = CASE WHEN _blocked THEN auth.uid() ELSE NULL END,
         updated_at     = now()
   WHERE id = _store_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.phonee_set_store_blocked(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phonee_set_store_blocked(uuid, boolean) TO authenticated;

-- 6) RPC para o frontend saber se o usuário logado tem alguma loja bloqueada
CREATE OR REPLACE FUNCTION public.my_access_block_status()
RETURNS TABLE(is_blocked boolean, store_id uuid, store_name text, blocked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.access_blocked, s.id, s.name, s.blocked_at
    FROM public.stores s
   WHERE s.access_blocked = true
     AND (
       s.owner_id = auth.uid()
       OR EXISTS (
         SELECT 1 FROM public.user_stores us
          WHERE us.user_id = auth.uid() AND us.store_id = s.id
       )
     )
   ORDER BY s.blocked_at DESC NULLS LAST
   LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.my_access_block_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access_block_status() TO authenticated;

-- 7) Recria phonee_stores incluindo status de bloqueio
DROP FUNCTION IF EXISTS public.phonee_stores();
CREATE OR REPLACE FUNCTION public.phonee_stores()
RETURNS TABLE(
  store_id uuid, store_name text, owner_id uuid, owner_email text, owner_name text,
  plan_name text, billing_cycle text, subscription_status text, expires_at timestamptz,
  created_at timestamptz, total_sales numeric, sales_count bigint, avg_ticket numeric,
  access_blocked boolean, blocked_at timestamptz, blocked_by uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.name, s.owner_id, p.email,
    COALESCE(NULLIF(p.full_name, ''), p.email),
    pl.name, sub.billing_cycle, sub.status, sub.expires_at, s.created_at,
    COALESCE(agg.total_sales, 0),
    COALESCE(agg.sales_count, 0),
    COALESCE(agg.avg_ticket, 0),
    s.access_blocked, s.blocked_at, s.blocked_by
  FROM public.stores s
  LEFT JOIN public.profiles p ON p.id = s.owner_id
  LEFT JOIN LATERAL (
    SELECT sub2.billing_cycle, sub2.status, sub2.expires_at, sub2.plan_id
      FROM public.subscriptions sub2
     WHERE sub2.store_id = s.id
     ORDER BY sub2.created_at DESC LIMIT 1
  ) sub ON true
  LEFT JOIN public.plans pl ON pl.id = sub.plan_id
  LEFT JOIN LATERAL (
    SELECT SUM(sa.total) AS total_sales, COUNT(*) AS sales_count, AVG(sa.total) AS avg_ticket
      FROM public.sales sa WHERE sa.store_id = s.id
  ) agg ON true
  WHERE public.is_admin_master(auth.uid())
    AND s.slug <> 'loja-demonstracao-phonee'
  ORDER BY s.created_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.phonee_stores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.phonee_stores() TO authenticated;