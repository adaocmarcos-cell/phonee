import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { asaasFetch, corsHeaders, jsonResponse } from "../_shared/asaas.ts";

const Schema = z.object({
  plan_code: z.enum(["annual", "lifetime"]),
  customer_name: z.string().trim().min(2).max(120),
  customer_email: z.string().trim().email().max(255),
  customer_phone: z.string().trim().min(8).max(20),
  customer_doc: z.string().trim().min(11).max(20),
  payment_method: z.enum(["PIX", "CREDIT_CARD"]),
  installments: z.number().int().min(1).max(12).default(1),
  store_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  billing_cycle: z.enum(["annual", "lifetime"]).optional(),
});

function onlyDigits(s: string) { return s.replace(/\D/g, ""); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
    const input = parsed.data;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await admin.from("asaas_settings").select("*").limit(1).maybeSingle();
    const env = (settings?.environment ?? "sandbox") as "sandbox" | "production";
    if (!Deno.env.get("ASAAS_API_KEY")) return jsonResponse({ error: "Pagamentos ainda não configurados pelo administrador." }, 503);

    const { data: plan, error: planErr } = await admin.from("plans").select("*").eq("code", input.plan_code).eq("active", true).single();
    if (planErr || !plan) return jsonResponse({ error: "Plano não encontrado" }, 404);

    const installments = input.payment_method === "CREDIT_CARD" ? Math.min(input.installments, plan.max_installments) : 1;
    const docDigits = onlyDigits(input.customer_doc);
    const phoneDigits = onlyDigits(input.customer_phone);

    // 1) Customer
    const custRes = await asaasFetch(env, "/customers", {
      method: "POST",
      body: JSON.stringify({
        name: input.customer_name,
        email: input.customer_email,
        cpfCnpj: docDigits,
        mobilePhone: phoneDigits,
        notificationDisabled: false,
      }),
    });
    if (!custRes.ok) {
      await admin.from("payment_logs").insert({
        event_type: "customer_create_failed", status: "error",
        asaas_payload: custRes.data, action: "create_customer",
      });
      return jsonResponse({ error: "Falha ao criar cliente no Asaas", details: custRes.data }, 502);
    }
    const customerId = custRes.data.id;

    // 2) Payment
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 3);
    const dueStr = dueDate.toISOString().slice(0, 10);
    const totalValue = plan.price_cents / 100;
    const paymentBody: any = {
      customer: customerId,
      billingType: input.payment_method,
      dueDate: dueStr,
      description: `${plan.name} - Mobile+`,
      externalReference: `${plan.code}:${input.customer_email}`,
    };
    if (input.payment_method === "CREDIT_CARD" && installments > 1) {
      paymentBody.installmentCount = installments;
      paymentBody.installmentValue = Math.round((totalValue / installments) * 100) / 100;
    } else {
      paymentBody.value = totalValue;
    }
    const payRes = await asaasFetch(env, "/payments", { method: "POST", body: JSON.stringify(paymentBody) });
    if (!payRes.ok) {
      await admin.from("payment_logs").insert({
        event_type: "payment_create_failed", status: "error",
        asaas_payload: payRes.data, action: "create_payment",
      });
      return jsonResponse({ error: "Falha ao criar cobrança", details: payRes.data }, 502);
    }
    const chargeId = payRes.data.id;
    const invoiceUrl = payRes.data.invoiceUrl;

    let pixQr: string | null = null;
    let pixCopy: string | null = null;
    if (input.payment_method === "PIX") {
      const qrRes = await asaasFetch(env, `/payments/${chargeId}/pixQrCode`);
      if (qrRes.ok) {
        pixQr = qrRes.data.encodedImage ?? null;
        pixCopy = qrRes.data.payload ?? null;
      }
    }

    const { data: sub, error: subErr } = await admin.from("subscriptions").insert({
      plan_id: plan.id,
      user_id: input.user_id ?? null,
      store_id: input.store_id ?? null,
      billing_cycle: input.billing_cycle ?? input.plan_code,
      customer_name: input.customer_name,
      customer_email: input.customer_email.toLowerCase(),
      customer_phone: phoneDigits,
      customer_doc: docDigits,
      payment_method: input.payment_method,
      status: "pending",
      amount_cents: plan.price_cents,
      installments,
      asaas_customer_id: customerId,
      asaas_charge_id: chargeId,
      invoice_url: invoiceUrl,
      pix_qr_code: pixQr,
      pix_copy_paste: pixCopy,
      started_at: new Date().toISOString(),
      expires_at: (input.billing_cycle ?? input.plan_code) === "annual"
        ? new Date(Date.now() + 365 * 86400000).toISOString()
        : null,
    }).select().single();
    if (subErr) return jsonResponse({ error: "Falha ao salvar assinatura", details: subErr.message }, 500);

    await admin.from("payment_logs").insert({
      subscription_id: sub.id,
      event_type: "PAYMENT_CREATED",
      status: "pending",
      amount_cents: plan.price_cents,
      asaas_payload: payRes.data,
      action: "create_charge",
    });

    return jsonResponse({
      subscription_id: sub.id,
      charge_id: chargeId,
      invoice_url: invoiceUrl,
      pix_qr_code: pixQr,
      pix_copy_paste: pixCopy,
      payment_method: input.payment_method,
    });
  } catch (e) {
    return jsonResponse({ error: String(e?.message ?? e) }, 500);
  }
});