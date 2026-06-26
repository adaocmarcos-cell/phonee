
CREATE TABLE IF NOT EXISTS public.marketing_investments (
  id uuid primary key default gen_random_uuid(),
  reference_date date not null default current_date,
  channel text not null default 'meta_ads',
  campaign text,
  adset text,
  ad text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  amount_cents integer not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  clicks integer not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_investments TO authenticated;
GRANT ALL ON public.marketing_investments TO service_role;
ALTER TABLE public.marketing_investments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mi_select ON public.marketing_investments;
DROP POLICY IF EXISTS mi_insert ON public.marketing_investments;
DROP POLICY IF EXISTS mi_update ON public.marketing_investments;
DROP POLICY IF EXISTS mi_delete ON public.marketing_investments;
CREATE POLICY mi_select ON public.marketing_investments FOR SELECT TO authenticated USING (public.is_admin_master(auth.uid()));
CREATE POLICY mi_insert ON public.marketing_investments FOR INSERT TO authenticated WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY mi_update ON public.marketing_investments FOR UPDATE TO authenticated USING (public.is_admin_master(auth.uid())) WITH CHECK (public.is_admin_master(auth.uid()));
CREATE POLICY mi_delete ON public.marketing_investments FOR DELETE TO authenticated USING (public.is_admin_master(auth.uid()));
CREATE INDEX IF NOT EXISTS mi_date_idx ON public.marketing_investments(reference_date DESC);
CREATE INDEX IF NOT EXISTS mi_campaign_idx ON public.marketing_investments(utm_campaign);
CREATE TRIGGER trg_mi_updated BEFORE UPDATE ON public.marketing_investments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'novo';
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.demo_leads ADD COLUMN IF NOT EXISTS fbclid text;

CREATE OR REPLACE FUNCTION public.phonee_marketing_dashboard(
  _from timestamptz DEFAULT now() - interval '30 days',
  _to   timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invest numeric; v_impr bigint; v_reach bigint; v_clicks bigint;
  v_leads bigint; v_sales bigint; v_revenue numeric;
  v_cpc numeric; v_cpm numeric; v_ctr numeric;
  v_cpl numeric; v_cps numeric; v_roas numeric;
  v_by_day jsonb; v_by_campaign jsonb; v_funnel jsonb;
BEGIN
  IF NOT public.is_admin_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(amount_cents),0)/100.0,
         COALESCE(SUM(impressions),0),
         COALESCE(SUM(reach),0),
         COALESCE(SUM(clicks),0)
    INTO v_invest, v_impr, v_reach, v_clicks
    FROM public.marketing_investments
   WHERE reference_date BETWEEN _from::date AND _to::date;

  SELECT count(*) FILTER (WHERE event_name IN ('Lead','CompleteRegistration')),
         count(*) FILTER (WHERE event_name = 'Purchase'),
         COALESCE(SUM(value) FILTER (WHERE event_name='Purchase'),0)
    INTO v_leads, v_sales, v_revenue
    FROM public.meta_pixel_events
   WHERE created_at BETWEEN _from AND _to;

  v_cpc  := CASE WHEN v_clicks>0 THEN v_invest/v_clicks ELSE 0 END;
  v_cpm  := CASE WHEN v_impr>0   THEN v_invest*1000/v_impr ELSE 0 END;
  v_ctr  := CASE WHEN v_impr>0   THEN v_clicks::numeric*100/v_impr ELSE 0 END;
  v_cpl  := CASE WHEN v_leads>0  THEN v_invest/v_leads ELSE 0 END;
  v_cps  := CASE WHEN v_sales>0  THEN v_invest/v_sales ELSE 0 END;
  v_roas := CASE WHEN v_invest>0 THEN v_revenue/v_invest ELSE 0 END;

  SELECT jsonb_agg(jsonb_build_object(
    'day', d::date, 'investment', inv, 'leads', l, 'purchases', p, 'revenue', rev, 'clicks', clk
  ) ORDER BY d) INTO v_by_day FROM (
    SELECT day AS d,
      COALESCE((SELECT SUM(amount_cents)/100.0 FROM public.marketing_investments
                 WHERE reference_date = day::date),0) AS inv,
      COALESCE((SELECT SUM(clicks) FROM public.marketing_investments
                 WHERE reference_date = day::date),0) AS clk,
      COALESCE((SELECT count(*) FROM public.meta_pixel_events
                 WHERE event_name IN ('Lead','CompleteRegistration')
                   AND date_trunc('day',created_at)=day),0) AS l,
      COALESCE((SELECT count(*) FROM public.meta_pixel_events
                 WHERE event_name='Purchase' AND date_trunc('day',created_at)=day),0) AS p,
      COALESCE((SELECT SUM(value) FROM public.meta_pixel_events
                 WHERE event_name='Purchase' AND date_trunc('day',created_at)=day),0) AS rev
    FROM generate_series(date_trunc('day',_from), date_trunc('day',_to), interval '1 day') day
  ) t;

  WITH inv AS (
    SELECT COALESCE(NULLIF(utm_campaign,''), COALESCE(campaign,'(sem campanha)')) AS campaign,
           SUM(amount_cents)/100.0 AS invest,
           SUM(clicks) AS clicks,
           SUM(impressions) AS impr
      FROM public.marketing_investments
     WHERE reference_date BETWEEN _from::date AND _to::date
     GROUP BY 1
  ), conv AS (
    SELECT COALESCE(NULLIF(utm_campaign,''),'(sem campanha)') AS campaign,
           count(*) FILTER (WHERE event_name IN ('Lead','CompleteRegistration')) AS l,
           count(*) FILTER (WHERE event_name='Purchase') AS s,
           COALESCE(SUM(value) FILTER (WHERE event_name='Purchase'),0) AS rev
      FROM public.meta_pixel_events
     WHERE created_at BETWEEN _from AND _to
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'campaign', campaign,
    'investment', COALESCE(invest,0),
    'clicks', COALESCE(clicks,0),
    'impressions', COALESCE(impr,0),
    'leads', COALESCE(l,0),
    'sales', COALESCE(s,0),
    'revenue', COALESCE(rev,0),
    'cpl', CASE WHEN COALESCE(l,0)>0 AND COALESCE(invest,0)>0 THEN invest/l ELSE 0 END,
    'roas', CASE WHEN COALESCE(invest,0)>0 THEN COALESCE(rev,0)/invest ELSE 0 END
  ) ORDER BY COALESCE(rev,0) DESC, COALESCE(invest,0) DESC) INTO v_by_campaign
  FROM (
    SELECT COALESCE(i.campaign, c.campaign) AS campaign,
           i.invest, i.clicks, i.impr, c.l, c.s, c.rev
      FROM inv i FULL OUTER JOIN conv c ON c.campaign = i.campaign
  ) m;

  v_funnel := jsonb_build_object(
    'visits', (SELECT count(*) FROM public.page_visits WHERE created_at BETWEEN _from AND _to),
    'view_content', (SELECT count(*) FROM public.meta_pixel_events WHERE event_name='ViewContent' AND created_at BETWEEN _from AND _to),
    'leads', v_leads,
    'initiate_checkout', (SELECT count(*) FROM public.meta_pixel_events WHERE event_name='InitiateCheckout' AND created_at BETWEEN _from AND _to),
    'purchases', v_sales
  );

  RETURN jsonb_build_object(
    'from', _from, 'to', _to,
    'investment', v_invest, 'impressions', v_impr, 'reach', v_reach, 'clicks', v_clicks,
    'cpc', v_cpc, 'cpm', v_cpm, 'ctr', v_ctr,
    'leads', v_leads, 'cpl', v_cpl,
    'sales', v_sales, 'cps', v_cps,
    'revenue', v_revenue, 'roas', v_roas,
    'by_day', COALESCE(v_by_day,'[]'::jsonb),
    'by_campaign', COALESCE(v_by_campaign,'[]'::jsonb),
    'funnel', v_funnel
  );
END $$;
REVOKE ALL ON FUNCTION public.phonee_marketing_dashboard(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phonee_marketing_dashboard(timestamptz, timestamptz) TO authenticated, service_role;
