
-- 1) Internal-only functions (triggers + helpers): revoke from anon/authenticated/PUBLIC
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.set_updated_at()',
    'public.handle_new_user()',
    'public.assign_sale_number()',
    'public.assign_os_number()',
    'public.tg_push_on_service_order()',
    'public.tg_push_on_sale()',
    'public.tg_push_on_low_stock()',
    'public.tg_referral_on_subscription_active()',
    'public.tg_stock_adjustment_audit()',
    'public.tg_stock_inconsistency_alert()',
    'public.tg_tradein_to_product()',
    'public.tg_trade_in_audit()',
    'public.tg_support_ticket_status_change()',
    'public.tg_user_profile_extras_guard()',
    'public.dispatch_push_event(text, uuid, jsonb)',
    'public.redeem_coupon(text, uuid, uuid, text, integer, integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 2) Admin-master / authenticated-only RPCs: remove anon access (keep authenticated; auth is enforced inside)
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.is_admin_master(uuid)',
    'public.is_owner(uuid, uuid)',
    'public.has_role(uuid, uuid, app_role)',
    'public.user_has_store_access(uuid, uuid)',
    'public.my_stores(uuid)',
    'public.get_store_sellers(uuid)',
    'public.get_meta_pixel_id()',
    'public.generate_referral_code(uuid)',
    'public.referral_balance(uuid)',
    'public.referral_pending_balance(uuid)',
    'public.referral_dashboard(uuid)',
    'public.referral_ranking()',
    'public.use_referral_credit(integer, text)',
    'public.create_purchase_with_stock(uuid, uuid, text, text, text, date, timestamptz, text, text[], jsonb, boolean)',
    'public.mobileplus_overview()',
    'public.mobileplus_stores()',
    'public.mobileplus_users()',
    'public.mobileplus_growth()',
    'public.mobileplus_referrals_overview()',
    'public.mobileplus_coupons_revenue(integer)',
    'public.mobileplus_traffic_paths()',
    'public.mobileplus_sales_traffic(integer, timestamptz, timestamptz, uuid, text)',
    'public.phonee_overview()',
    'public.phonee_stores()',
    'public.phonee_users()',
    'public.phonee_growth()',
    'public.phonee_referrals_overview()',
    'public.phonee_coupons_revenue(integer)',
    'public.phonee_traffic_paths()',
    'public.phonee_sales_traffic(integer, timestamptz, timestamptz, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- 3) Public (pre-auth) RPCs intentionally kept callable by anon: apply_coupon, trial_eligibility, register_referral
-- (no change needed — these are designed for checkout/landing flows before login)
