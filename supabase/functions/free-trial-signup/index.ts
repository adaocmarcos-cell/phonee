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

function normalizeInsta(s: string) {
  const t = s.trim().replace(/^@+/, "");
  return t ? "@" + t : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Rate limit por IP: máx 3 tentativas por hora
    const xff = req.headers.get("x-forwarded-for") ?? "";
    const ip = xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentAttempts } = await admin
      .from("trial_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneHourAgo);
    if ((recentAttempts ?? 0) >= 3) {
      await admin.from("trial_signup_attempts").insert({ ip });
      return json({ error: "Muitas tentativas. Tente novamente mais tarde." }, 429);
    }
    // Registra a tentativa (sucesso ou falha)
    await admin.from("trial_signup_attempts").insert({ ip });

    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const full_name = String(body?.full_name ?? "").trim();
    const whatsapp = String(body?.whatsapp ?? "").trim();
    const password = String(body?.password ?? "");
    const instagram = normalizeInsta(String(body?.instagram ?? ""));
    const store_name = String(body?.store_name ?? "").trim();
    const city = String(body?.city ?? "").trim();
    const state = String(body?.state ?? "").trim().toUpperCase().slice(0, 2);

    if (!store_name) return json({ error: "Informe o nome da loja." }, 400);
    if (!full_name) return json({ error: "Informe seu nome completo." }, 400);
    if (!email || !/.+@.+\..+/.test(email)) return json({ error: "E-mail inválido." }, 400);
    if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) return json({ error: "Informe um WhatsApp válido." }, 400);
    if (!instagram || instagram.length < 2) return json({ error: "Informe o @ do Instagram." }, 400);
    if (!city) return json({ error: "Informe a cidade." }, 400);
    if (!state || state.length !== 2) return json({ error: "Informe o estado (UF)." }, 400);
    if (password.length < 8) return json({ error: "Senha mínima de 8 caracteres." }, 400);

    // Block duplicates by email
    const { data: existing } = await admin
      .from("partner_trials")
      .select("id, status, kind")
      .eq("email", email)
      .maybeSingle();
    if (existing) {
      return json({ error: "Já existe um teste vinculado a este e-mail. Acesse pela página de login." }, 409);
    }

    // Create auth user
    let uid: string | null = null;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, free_trial: true, store_name, city, state },
    });
    if (cErr && !/already.*registered|exists/i.test(cErr.message)) {
      return json({ error: cErr.message }, 400);
    }
    if (created?.user) {
      uid = created.user.id;
    } else {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      uid = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
      if (uid) await admin.auth.admin.updateUserById(uid, { password });
    }

    await admin.from("profiles").upsert({
      id: uid!,
      full_name,
      email,
      phone: whatsapp || null,
    });

    const now = new Date();
    const trialEnds = new Date(now.getTime() + 7 * 86400_000);

    // Create a store for the trial user (so my_stores() returns something and
    // the app can be used during the trial period). Idempotent: skip if the
    // user already owns a store.
    if (uid) {
      const { data: existingStore } = await admin
        .from("stores")
        .select("id")
        .eq("owner_id", uid)
        .maybeSingle();
      if (!existingStore) {
        const baseSlug = (store_name || full_name || email.split("@")[0] || "loja")
          .toString()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 40) || "loja";
        let slug = baseSlug;
        for (let i = 0; i < 6; i++) {
          const { data: taken } = await admin.from("stores").select("id").eq("slug", slug).maybeSingle();
          if (!taken) break;
          slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
        }
        await admin.from("stores").insert({
          owner_id: uid,
          name: store_name || full_name || "Minha Loja",
          slug,
          email,
          phone: whatsapp || null,
          instagram: instagram || null,
          address_city: city || null,
          address_uf: state || null,
        });
      }
    }

    const noteParts = [
      store_name ? `Loja: ${store_name}` : "",
      instagram ? `Instagram: ${instagram}` : "",
      city || state ? `Local: ${city}${city && state ? " / " : ""}${state}` : "",
    ].filter(Boolean);

    const { data: row, error: ptErr } = await admin
      .from("partner_trials")
      .insert({
        user_id: uid,
        email,
        full_name,
        whatsapp: whatsapp || null,
        instagram: instagram || null,
        store_name: store_name || null,
        city: city || null,
        state: state || null,
        kind: "free_trial",
        notes: noteParts.join(" · ") || "Cadastro público · Teste grátis de 7 dias",
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
      screen: "/teste-gratis",
      action: "free_trial_signup",
      entity: "partner_trials",
      entity_id: (row as any)?.id ?? null,
      role: "public",
      status: "concluido",
      ip: req.headers.get("x-forwarded-for") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      details: { email, full_name, store_name, whatsapp, instagram, city, state },
    });

    return json({ ok: true, email, trial_ends_at: trialEnds.toISOString() });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});