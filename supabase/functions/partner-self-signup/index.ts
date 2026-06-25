import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const full_name = String(body?.full_name ?? "").trim();
    const whatsapp = String(body?.whatsapp ?? "").trim();
    const password = String(body?.password ?? "");
    const notes = String(body?.notes ?? "").trim();

    if (!email || !/.+@.+\..+/.test(email)) return json({ error: "E-mail inválido." }, 400);
    if (!full_name) return json({ error: "Informe seu nome." }, 400);
    if (password.length < 8) return json({ error: "Senha mínima de 8 caracteres." }, 400);

    // Block duplicates
    const { data: existing } = await admin
      .from("partner_trials")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return json({ error: "Já existe um cadastro de parceiro com este e-mail. Acesse pela página de login." }, 409);
    }

    // Create auth user
    let uid: string | null = null;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, partner_trial: true, partner_self_signup: true },
    });
    if (cErr && !/already.*registered|exists/i.test(cErr.message)) {
      return json({ error: cErr.message }, 400);
    }
    if (created?.user) {
      uid = created.user.id;
    } else {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      uid = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (uid) {
        await admin.auth.admin.updateUserById(uid, { password });
      }
    }

    await admin.from("profiles").upsert({
      id: uid!,
      full_name,
      email,
      phone: whatsapp || null,
    });

    const now = new Date();
    const trialEnds = new Date(now.getTime() + 7 * 86400_000);

    const { data: row, error: ptErr } = await admin
      .from("partner_trials")
      .insert({
        user_id: uid,
        email,
        full_name,
        whatsapp: whatsapp || null,
        notes: notes || "Cadastro público via /parceiros",
        activated_at: now.toISOString(),
        trial_days: 7,
        trial_ends_at: trialEnds.toISOString(),
        full_access_months: 12,
        status: "em_teste",
      })
      .select()
      .single();
    if (ptErr) return json({ error: ptErr.message }, 500);

    if (uid) {
      await admin.from("user_profile_extras").upsert(
        { user_id: uid, expires_at: trialEnds.toISOString(), status: "ativo" },
        { onConflict: "user_id" },
      );
    }

    await admin.from("audit_log").insert({
      user_id: uid,
      module: "admin_master",
      screen: "/parceiros",
      action: "partner_self_signup",
      entity: "partner_trials",
      entity_id: (row as any)?.id ?? null,
      role: "public",
      status: "concluido",
      ip: req.headers.get("x-forwarded-for") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      details: { email, full_name, whatsapp: whatsapp || null },
    });

    return json({ ok: true, email, trial_ends_at: trialEnds.toISOString() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});