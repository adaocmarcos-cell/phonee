-- 1) Clean up any existing duplicates (keep the earliest row that has user_id set)
WITH ranked AS (
  SELECT id, asaas_charge_id,
         ROW_NUMBER() OVER (
           PARTITION BY asaas_charge_id
           ORDER BY (user_id IS NOT NULL) DESC, created_at ASC
         ) AS rn
  FROM public.subscriptions
  WHERE asaas_charge_id IS NOT NULL
)
DELETE FROM public.subscriptions s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- 2) Partial unique index — enforces one subscription per Asaas charge
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_charge_uidx
  ON public.subscriptions (asaas_charge_id)
  WHERE asaas_charge_id IS NOT NULL;