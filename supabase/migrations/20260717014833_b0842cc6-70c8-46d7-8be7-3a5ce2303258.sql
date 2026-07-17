
REVOKE EXECUTE ON FUNCTION public.can_manage_commissions(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_commissions_for_sale(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_commissions_for_os(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pay_commission_entries(uuid[], text, date, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reverse_commission_payment(uuid) FROM anon, public;
