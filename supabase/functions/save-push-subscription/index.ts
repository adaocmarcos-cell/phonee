import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userRes, error: uerr } = await supabase.auth.getUser(token);
    if (uerr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userRes.user;

    const body = await req.json();
    const action = body.action ?? "subscribe";

    if (action === "unsubscribe") {
      const endpoint = String(body.endpoint ?? "");
      if (!endpoint) return new Response(JSON.stringify({ error: "missing endpoint" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sub = body.subscription ?? {};
    const endpoint = String(sub.endpoint ?? "");
    const p256dh = String(sub.keys?.p256dh ?? "");
    const authKey = String(sub.keys?.auth ?? "");
    const storeId = body.store_id ?? null;
    const ua = req.headers.get("User-Agent") ?? null;

    if (!endpoint || !p256dh || !authKey) {
      return new Response(JSON.stringify({ error: "invalid subscription" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: user.id,
      store_id: storeId,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: ua,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});