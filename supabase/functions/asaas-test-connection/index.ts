import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { asaasFetch, corsHeaders, jsonResponse } from "../_shared/asaas.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("is_admin_master", { _user_id: userId });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: settings } = await admin.from("asaas_settings").select("*").limit(1).maybeSingle();
    const env = (settings?.environment ?? "sandbox") as "sandbox" | "production";
    if (!Deno.env.get("ASAAS_API_KEY")) {
      await admin.from("asaas_settings").update({
        connection_status: "missing_key", last_tested_at: new Date().toISOString(),
      }).eq("id", settings!.id);
      return jsonResponse({ ok: false, status: "missing_key", message: "ASAAS_API_KEY não configurada" });
    }
    const r = await asaasFetch(env, "/myAccount");
    const status = r.ok ? "connected" : "error";
    await admin.from("asaas_settings").update({
      connection_status: status,
      account_email: r.ok ? (r.data?.email ?? null) : null,
      api_key_set: true,
      webhook_token_set: !!Deno.env.get("ASAAS_WEBHOOK_TOKEN"),
      last_tested_at: new Date().toISOString(),
    }).eq("id", settings!.id);
    return jsonResponse({ ok: r.ok, status, data: r.data });
  } catch (e) {
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});