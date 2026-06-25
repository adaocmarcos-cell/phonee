import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Auto-block partners whose 7-day trial expired and that were not manually
 * released to the 12-month period. Writes an audit_log entry per partner and
 * bans the underlying auth user.
 *
 * Intended to be invoked by pg_cron daily. Public route — no auth needed,
 * it only operates on rows that match the expiry criteria.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const nowIso = new Date().toISOString();
    const { data: expired, error } = await admin
      .from("partner_trials")
      .select("id, user_id, email, full_name, trial_ends_at, status, full_access_granted_at")
      .eq("status", "em_teste")
      .is("full_access_granted_at", null)
      .lte("trial_ends_at", nowIso);
    if (error) throw error;

    const results: any[] = [];
    for (const tr of expired ?? []) {
      try {
        await admin.from("partner_trials")
          .update({ status: "teste_expirado" })
          .eq("id", tr.id);

        if (tr.user_id) {
          await admin.auth.admin.updateUserById(tr.user_id, { ban_duration: "876000h" } as any);
          await admin.from("user_profile_extras").upsert(
            { user_id: tr.user_id, status: "inativo" },
            { onConflict: "user_id" },
          );
        }

        await admin.from("audit_log").insert({
          user_id: null,
          store_id: null,
          module: "admin_master",
          screen: "phonee/parceiros",
          action: "partner_auto_block_7d",
          entity: "partner_trials",
          entity_id: tr.id,
          role: "system",
          status: "concluido",
          details: {
            reason: "trial_expired_7d",
            email: tr.email,
            full_name: tr.full_name,
            trial_ends_at: tr.trial_ends_at,
            blocked_at: nowIso,
          },
        });

        results.push({ trial_id: tr.id, email: tr.email, blocked: true });
      } catch (e) {
        results.push({ trial_id: tr.id, email: tr.email, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});