
-- 1) marketing_settings: remove public SELECT, expose only pixel id via RPC
DROP POLICY IF EXISTS "public read pixel id" ON public.marketing_settings;

CREATE POLICY "admin master reads marketing"
ON public.marketing_settings
FOR SELECT TO authenticated
USING (public.is_admin_master(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_meta_pixel_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT meta_pixel_id FROM public.marketing_settings WHERE id = 1
$$;

GRANT EXECUTE ON FUNCTION public.get_meta_pixel_id() TO anon, authenticated;

-- 2) products: drop overly broad anon catalog policy (no public catalog page uses it)
DROP POLICY IF EXISTS products_public_catalog ON public.products;

-- 3) page_visits: tighten permissive INSERT
DROP POLICY IF EXISTS "anyone can log a page visit" ON public.page_visits;

CREATE POLICY "log page visit"
ON public.page_visits
FOR INSERT TO anon, authenticated
WITH CHECK (
  path IS NOT NULL
  AND length(path) BETWEEN 1 AND 500
  AND (referrer IS NULL OR length(referrer) <= 1000)
  AND (user_agent IS NULL OR length(user_agent) <= 1000)
  AND (session_id IS NULL OR length(session_id) <= 100)
);
