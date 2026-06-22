import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { asaasFetch, corsHeaders, jsonResponse } from "../_shared/asaas.ts";

const Schema = z.object({ subscription_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error } = await supabase.auth.getClaims(token);
    if (error || !claims?.claims) return jsonResponse({ error: "Unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("is_admin_master", { _user_id: claims.claims.sub });
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);

    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", parsed.data.subscription_id).single();
    if (!sub?.asaas_charge_id) return jsonResponse({ error: "Cobrança Asaas não encontrada" }, 404);
    const { data: settings } = await admin.from("asaas_settings").select("environment").limit(1).maybeSingle();
    const env = (settings?.environment ?? "sandbox") as "sandbox" | "production";

    const r = await asaasFetch(env, `/payments/${sub.asaas_charge_id}/refund`, { method: "POST", body: JSON.stringify({}) });
    await admin.from("payment_logs").insert({
      subscription_id: sub.id, event_type: "REFUND_REQUESTED",
      status: r.ok ? "refunded" : "refund_error", asaas_payload: r.data, action: "refund",
    });
    if (r.ok) {
      await admin.from("subscriptions").update({ status: "refunded", refund_status: "refunded" }).eq("id", sub.id);
    }
    return jsonResponse({ ok: r.ok, data: r.data });
  } catch (e) {
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});