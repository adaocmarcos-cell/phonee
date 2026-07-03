DO $$
DECLARE
  r jsonb;
BEGIN
  r := public.phonee_test_negative_stock_sale('01b2ac94-388e-4328-a034-9d7283491e52'::uuid);
  RAISE NOTICE 'E2E smoke test result: %', r;
  IF NOT (r->>'pass')::boolean THEN
    RAISE EXCEPTION 'phonee_test_negative_stock_sale FAILED: %', r;
  END IF;
END $$;