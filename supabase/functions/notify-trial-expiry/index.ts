// Cron-friendly notifier: alerts trials expiring in <= 3 days (in-app + email best-effort)
// and creates a post-expiry CTA alert. Idempotent — uses tracking columns on subscriptions.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const in3days = new Date(now.getTime() + 3 * 86400000).toISOString();

  const warnedIds: string[] = [];
  const expiredIds: string[] = [];
  const errors: any[] = [];

  // 1) Pre-expiry warning (T-3 days)
  const { data: warnTargets, error: warnErr } = await admin
    .from("subscriptions")
    .select("id,user_id,store_id,customer_email,customer_name,expires_at")
    .eq("billing_cycle", "trial")
    .eq("status", "active")
    .is("trial_warning_sent_at", null)
    .not("expires_at", "is", null)
    .lte("expires_at", in3days)
    .gte("expires_at", now.toISOString());

  if (warnErr) errors.push({ stage: "warn_select", error: warnErr.message });

  for (const sub of warnTargets ?? []) {
    try {
      if (sub.store_id) {
        await admin.from("alerts").insert({
          store_id: sub.store_id,
          type: "trial_expiring",
          severity: "warning",
          title: "Sua Mensalidade Teste expira em breve",
          message: `Faltam menos de 3 dias para o fim do seu teste (${new Date(sub.expires_at).toLocaleDateString("pt-BR")}). Garanta agora o Plano Anual ou Vitalício e não perca o acesso.`,
          link: "/comprar?plano=annual",
        });
      }
      // Best-effort email via Lovable Emails (no-op if templates não estiverem configurados).
      try {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "trial-expiring-soon",
            recipientEmail: sub.customer_email,
            idempotencyKey: `trial-warn-${sub.id}`,
            templateData: {
              name: sub.customer_name,
              expiresAt: sub.expires_at,
              upgradeUrl: "https://phonee.com.br/comprar?plano=annual",
            },
          },
        });
      } catch (_) { /* email infra ainda não configurada — alerta in-app já cobre */ }

      await admin
        .from("subscriptions")
        .update({ trial_warning_sent_at: new Date().toISOString() })
        .eq("id", sub.id);
      warnedIds.push(sub.id);
    } catch (e: any) {
      errors.push({ stage: "warn_dispatch", id: sub.id, error: String(e) });
    }
  }

  // 2) Post-expiry CTA (after expires_at)
  const { data: expTargets, error: expErr } = await admin
    .from("subscriptions")
    .select("id,store_id,customer_email,customer_name,expires_at")
    .eq("billing_cycle", "trial")
    .is("trial_expired_notice_sent_at", null)
    .not("expires_at", "is", null)
    .lte("expires_at", now.toISOString());

  if (expErr) errors.push({ stage: "exp_select", error: expErr.message });

  for (const sub of expTargets ?? []) {
    try {
      if (sub.store_id) {
        await admin.from("alerts").insert({
          store_id: sub.store_id,
          type: "trial_expired",
          severity: "critica",
          title: "Sua Mensalidade Teste expirou",
          message: "Para manter o acesso ao Phonee, contrate o Plano Anual ou Vitalício agora.",
          link: "/comprar?plano=annual",
        });
      }
      try {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "trial-expired",
            recipientEmail: sub.customer_email,
            idempotencyKey: `trial-exp-${sub.id}`,
            templateData: {
              name: sub.customer_name,
              upgradeUrl: "https://phonee.com.br/comprar?plano=annual",
              lifetimeUrl: "https://phonee.com.br/comprar?plano=lifetime",
            },
          },
        });
      } catch (_) { /* idem */ }

      await admin
        .from("subscriptions")
        .update({ trial_expired_notice_sent_at: new Date().toISOString() })
        .eq("id", sub.id);
      expiredIds.push(sub.id);
    } catch (e: any) {
      errors.push({ stage: "exp_dispatch", id: sub.id, error: String(e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    warned: warnedIds.length,
    expired_notified: expiredIds.length,
    errors,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});