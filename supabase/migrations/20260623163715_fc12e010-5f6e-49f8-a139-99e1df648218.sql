
-- 1) Extender subscriptions para multi-loja
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'annual'
    CHECK (billing_cycle IN ('annual','lifetime'));

-- Backfill: vincula assinaturas existentes à loja própria do user
UPDATE public.subscriptions s
SET store_id = st.id
FROM public.stores st
WHERE s.store_id IS NULL AND st.owner_id = s.user_id;

CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON public.subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- 2) Tabela de transferências de produtos entre lojas
CREATE TABLE IF NOT EXISTS public.product_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  to_store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  from_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  to_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_transfers TO authenticated;
GRANT ALL ON public.product_transfers TO service_role;

ALTER TABLE public.product_transfers ENABLE ROW LEVEL SECURITY;

-- O usuário só pode ver/criar transferências entre lojas que ele possui
CREATE POLICY "owner can read transfers"
ON public.product_transfers
FOR SELECT
TO authenticated
USING (
  public.is_owner(auth.uid(), from_store_id)
  AND public.is_owner(auth.uid(), to_store_id)
);

CREATE POLICY "owner can create transfers"
ON public.product_transfers
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_owner(auth.uid(), from_store_id)
  AND public.is_owner(auth.uid(), to_store_id)
  AND from_store_id <> to_store_id
  AND user_id = auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_product_transfers_from_store ON public.product_transfers(from_store_id);
CREATE INDEX IF NOT EXISTS idx_product_transfers_to_store ON public.product_transfers(to_store_id);

-- 3) Função para listar todas as lojas do usuário com status da assinatura
CREATE OR REPLACE FUNCTION public.my_stores(_user_id uuid)
RETURNS TABLE (
  store_id uuid,
  name text,
  slug text,
  logo_url text,
  is_owner boolean,
  role public.app_role,
  subscription_status text,
  billing_cycle text,
  expires_at timestamptz,
  plan_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH stores_for_user AS (
    -- Lojas próprias
    SELECT s.id, s.name, s.slug, s.logo_url, true AS is_owner
    FROM public.stores s
    WHERE s.owner_id = _user_id
    UNION
    -- Lojas vinculadas
    SELECT s.id, s.name, s.slug, s.logo_url, (s.owner_id = _user_id) AS is_owner
    FROM public.stores s
    JOIN public.user_stores us ON us.store_id = s.id
    WHERE us.user_id = _user_id
  ),
  latest_sub AS (
    SELECT DISTINCT ON (sub.store_id)
      sub.store_id, sub.status, sub.billing_cycle, sub.expires_at, p.name AS plan_name
    FROM public.subscriptions sub
    LEFT JOIN public.plans p ON p.id = sub.plan_id
    WHERE sub.store_id IS NOT NULL
    ORDER BY sub.store_id, sub.created_at DESC
  )
  SELECT
    sfu.id AS store_id,
    sfu.name,
    sfu.slug,
    sfu.logo_url,
    sfu.is_owner,
    (
      SELECT ur.role FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.store_id = sfu.id
      ORDER BY (ur.role = 'dono') DESC
      LIMIT 1
    ) AS role,
    COALESCE(ls.status, 'sem_assinatura') AS subscription_status,
    COALESCE(ls.billing_cycle, 'annual') AS billing_cycle,
    ls.expires_at,
    ls.plan_name
  FROM stores_for_user sfu
  LEFT JOIN latest_sub ls ON ls.store_id = sfu.id
  ORDER BY sfu.is_owner DESC, sfu.name;
$$;

GRANT EXECUTE ON FUNCTION public.my_stores(uuid) TO authenticated;
