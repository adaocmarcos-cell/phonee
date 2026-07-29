CREATE OR REPLACE FUNCTION public.reconcile_stock(_store_id uuid)
RETURNS TABLE (
  product_id uuid,
  name text,
  sku text,
  item_kind text,
  stock_current numeric,
  ledger_balance numeric,
  difference numeric,
  last_movement_at timestamptz,
  last_movement_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH allowed AS (
    SELECT (auth.uid() IS NULL
            OR public.is_admin_master(auth.uid())
            OR public.user_has_store_access(auth.uid(), _store_id)) AS ok
  ),
  last_mov AS (
    SELECT DISTINCT ON (m.product_id)
           m.product_id, m.balance_after, m.occurred_at, m.type
    FROM public.stock_movements m
    WHERE m.store_id = _store_id
    ORDER BY m.product_id, m.occurred_at DESC, m.created_at DESC, m.id DESC
  )
  SELECT p.id,
         p.name,
         p.sku,
         p.item_kind::text,
         COALESCE(p.stock_current, 0)::numeric,
         COALESCE(l.balance_after, 0)::numeric,
         (COALESCE(p.stock_current, 0) - COALESCE(l.balance_after, 0))::numeric,
         l.occurred_at,
         l.type
  FROM public.products p
  CROSS JOIN allowed a
  LEFT JOIN last_mov l ON l.product_id = p.id
  WHERE a.ok
    AND p.store_id = _store_id
    AND COALESCE(p.stock_current, 0) <> COALESCE(l.balance_after, 0)
  ORDER BY abs(COALESCE(p.stock_current, 0) - COALESCE(l.balance_after, 0)) DESC, p.name;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stock(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_stock(uuid) TO authenticated, service_role;