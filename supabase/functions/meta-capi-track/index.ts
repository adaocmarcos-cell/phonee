import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normPhone(p: string) {
  return p.replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      event_name,
      event_id,
      event_source_url,
      value,
      currency = "BRL",
      email,
      phone,
      fbp,
      fbc,
      custom_data,
      session_id,
      test_event_code,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      referrer,
      landing_path,
    } = body || {};

    if (!event_name || !event_id) {
      return new Response(JSON.stringify({ error: "event_name and event_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRole);

    // marketing settings: pixel id + access token
    const { data: ms } = await admin
      .from("marketing_settings")
      .select("meta_pixel_id, meta_access_token")
      .eq("id", 1)
      .maybeSingle();

    const pixelId = (ms as any)?.meta_pixel_id?.trim();
    const accessToken = (ms as any)?.meta_access_token?.trim();

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") ?? null;

    const emailHash = email ? await sha256(String(email)) : null;
    const phoneHash = phone ? await sha256(normPhone(String(phone))) : null;

    let capiStatus: number | null = null;
    let capiResponse: any = null;

    if (pixelId && accessToken) {
      const userData: Record<string, unknown> = {};
      if (emailHash) userData.em = [emailHash];
      if (phoneHash) userData.ph = [phoneHash];
      if (fbp) userData.fbp = fbp;
      if (fbc) userData.fbc = fbc;
      if (ip) userData.client_ip_address = ip;
      if (ua) userData.client_user_agent = ua;

      const evt: Record<string, unknown> = {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id,
        event_source_url,
        action_source: "website",
        user_data: userData,
      };
      const cd: Record<string, unknown> = { ...(custom_data || {}) };
      if (typeof value === "number") cd.value = value;
      if (currency) cd.currency = currency;
      if (Object.keys(cd).length) evt.custom_data = cd;

      const payload: Record<string, unknown> = { data: [evt] };
      if (test_event_code) payload.test_event_code = test_event_code;

      const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        capiStatus = resp.status;
        capiResponse = await resp.json().catch(() => null);
      } catch (e) {
        capiStatus = 0;
        capiResponse = { error: String(e) };
      }
    } else {
      capiResponse = { skipped: true, reason: "missing_pixel_or_token" };
    }

    await admin.from("meta_pixel_events").insert({
      event_name,
      event_id,
      source: "server",
      event_source_url: event_source_url ?? null,
      value: typeof value === "number" ? value : null,
      currency: currency ?? null,
      email_hash: emailHash,
      phone_hash: phoneHash,
      fbp: fbp ?? null,
      fbc: fbc ?? null,
      user_agent: ua,
      ip,
      test_event_code: test_event_code ?? null,
      capi_status: capiStatus,
      capi_response: capiResponse,
      custom_data: custom_data ?? null,
      session_id: session_id ?? null,
      utm_source: utm_source ?? null,
      utm_medium: utm_medium ?? null,
      utm_campaign: utm_campaign ?? null,
      utm_term: utm_term ?? null,
      utm_content: utm_content ?? null,
      referrer: referrer ?? null,
      landing_path: landing_path ?? null,
    });

    // Also log browser side echo (so painel shows pixel event too)
    if (body.log_browser_echo) {
      await admin.from("meta_pixel_events").insert({
        event_name,
        event_id,
        source: "browser",
        event_source_url: event_source_url ?? null,
        value: typeof value === "number" ? value : null,
        currency: currency ?? null,
        user_agent: ua,
        ip,
        session_id: session_id ?? null,
        custom_data: custom_data ?? null,
        test_event_code: test_event_code ?? null,
        utm_source: utm_source ?? null,
        utm_medium: utm_medium ?? null,
        utm_campaign: utm_campaign ?? null,
        utm_term: utm_term ?? null,
        utm_content: utm_content ?? null,
        referrer: referrer ?? null,
        landing_path: landing_path ?? null,
      });
    }

    return new Response(JSON.stringify({ ok: true, capi_status: capiStatus, capi_response: capiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});