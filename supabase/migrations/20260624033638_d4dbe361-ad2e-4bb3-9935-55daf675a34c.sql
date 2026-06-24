
-- Aliases phonee_* delegando para mobileplus_* (mantemos as antigas por compatibilidade)
CREATE OR REPLACE FUNCTION public.phonee_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.mobileplus_overview() $$;

CREATE OR REPLACE FUNCTION public.phonee_stores()
RETURNS TABLE(store_id uuid, store_name text, owner_id uuid, owner_email text, owner_name text, plan_name text, billing_cycle text, subscription_status text, expires_at timestamp with time zone, created_at timestamp with time zone, total_sales numeric, sales_count bigint, avg_ticket numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.mobileplus_stores() $$;

CREATE OR REPLACE FUNCTION public.phonee_users()
RETURNS TABLE(user_id uuid, email text, full_name text, created_at timestamp with time zone, stores_count bigint, roles text[], stores jsonb, plan_name text, subscription_status text, is_admin_master boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.mobileplus_users() $$;

CREATE OR REPLACE FUNCTION public.phonee_growth()
RETURNS TABLE(month_start date, new_stores bigint, new_subscriptions bigint, gmv numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.mobileplus_growth() $$;

CREATE OR REPLACE FUNCTION public.phonee_referrals_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.mobileplus_referrals_overview() $$;

CREATE OR REPLACE FUNCTION public.phonee_coupons_revenue(_days integer DEFAULT 90)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.mobileplus_coupons_revenue(_days) $$;

CREATE OR REPLACE FUNCTION public.phonee_sales_traffic(_days integer DEFAULT 30, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL, _store_id uuid DEFAULT NULL, _path text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.mobileplus_sales_traffic(_days, _from, _to, _store_id, _path) $$;

CREATE OR REPLACE FUNCTION public.phonee_traffic_paths()
RETURNS TABLE(path text, visits bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.mobileplus_traffic_paths() $$;

-- Restringe execução pública: somente authenticated (admin master é validado dentro)
REVOKE EXECUTE ON FUNCTION public.phonee_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_stores() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_growth() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_referrals_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_coupons_revenue(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_sales_traffic(integer, timestamptz, timestamptz, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.phonee_traffic_paths() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.phonee_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_stores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_growth() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_referrals_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_coupons_revenue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_sales_traffic(integer, timestamptz, timestamptz, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.phonee_traffic_paths() TO authenticated;
