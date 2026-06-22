import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, jsonResponse } from "../_shared/asaas.ts";

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
    if (!sub) return jsonResponse({ error: "Não encontrado" }, 404);
    await admin.from("payment_logs").insert({
      subscription_id: sub.id, event_type: "RESEND_REQUESTED", status: sub.status,
      asaas_payload: { invoice_url: sub.invoice_url }, action: "resend_charge",
    });
    return jsonResponse({ ok: true, invoice_url: sub.invoice_url });
  } catch (e) {
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});