
INSERT INTO public.stores (owner_id, name, slug, email, phone, instagram, address_city, address_uf)
SELECT
  pt.user_id,
  COALESCE(NULLIF(pt.store_name, ''), NULLIF(pt.full_name, ''), 'Minha Loja') AS name,
  regexp_replace(
    lower(COALESCE(NULLIF(pt.store_name, ''), NULLIF(pt.full_name, ''), split_part(pt.email, '@', 1), 'loja')),
    '[^a-z0-9]+', '-', 'g'
  ) || '-' || substr(md5(pt.user_id::text), 1, 5) AS slug,
  pt.email,
  pt.whatsapp,
  pt.instagram,
  pt.city,
  pt.state
FROM public.partner_trials pt
WHERE pt.user_id IS NOT NULL
  AND pt.status = 'em_teste'
  AND pt.trial_ends_at > now()
  AND NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.owner_id = pt.user_id);
