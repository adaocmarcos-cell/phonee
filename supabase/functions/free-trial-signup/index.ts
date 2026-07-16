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
      return json({ error: "Muitas tentativas. Tente novamente mais tarde.", code: "rate_limited" });
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

    if (!store_name) return json({ error: "Informe o nome da loja.", code: "validation" });
    if (!full_name) return json({ error: "Informe seu nome completo.", code: "validation" });
    if (!email || !/.+@.+\..+/.test(email)) return json({ error: "E-mail inválido.", code: "validation" });
    if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) return json({ error: "Informe um WhatsApp válido.", code: "validation" });
    if (!instagram || instagram.length < 2) return json({ error: "Informe o @ do Instagram.", code: "validation" });
    if (!city) return json({ error: "Informe a cidade.", code: "validation" });
    if (!state || state.length !== 2) return json({ error: "Informe o estado (UF).", code: "validation" });
    if (password.length < 8) return json({ error: "Senha mínima de 8 caracteres.", code: "validation" });

    // Dedup: reuse existing partner_trials row for the same email instead of
    // inserting a duplicate. Cadastros com o mesmo e-mail são atualizados.
    const { data: existingTrial } = await admin
      .from("partner_trials")
      .select("id, user_id, status")
      .ilike("email", email)
      .maybeSingle();

    // Create auth user
    let uid: string | null = null;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, free_trial: true, store_name, city, state },
    });
    if (cErr && !/already.*registered|exists/i.test(cErr.message)) {
      return json({ error: cErr.message, code: "auth_create_failed" });
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
      const backfillCreated: { store?: string; user_stores?: boolean; user_roles?: boolean } = {};
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
        const { data: newStore } = await admin.from("stores").insert({
          owner_id: uid,
          name: store_name || full_name || "Minha Loja",
          slug,
          email,
          phone: whatsapp || null,
          instagram: instagram || null,
          address_city: city || null,
          address_uf: state || null,
        }).select("id").single();
        if (newStore?.id) backfillCreated.store = newStore.id as string;
      }

      // Ensure user_stores + user_roles link exists (idempotent) so the owner
      // can actually operate the store after login.
      const { data: ownerStore } = await admin
        .from("stores")
        .select("id")
        .eq("owner_id", uid)
        .maybeSingle();
      const ownerStoreId = (ownerStore as any)?.id ?? null;
      if (ownerStoreId) {
        const { data: usLink } = await admin
          .from("user_stores")
          .select("user_id")
          .eq("user_id", uid)
          .eq("store_id", ownerStoreId)
          .maybeSingle();
        if (!usLink) {
          await admin.from("user_stores").insert({ user_id: uid, store_id: ownerStoreId });
          backfillCreated.user_stores = true;
        }
        const { data: roleLink } = await admin
          .from("user_roles")
          .select("id")
          .eq("user_id", uid)
          .eq("store_id", ownerStoreId)
          .eq("role", "dono")
          .maybeSingle();
        if (!roleLink) {
          await admin.from("user_roles").insert({ user_id: uid, store_id: ownerStoreId, role: "dono" });
          backfillCreated.user_roles = true;
        }
      }

      // Register backfill activity when we corrected missing links for a
      // returning trial user (idempotent path). Also fires on first signup
      // as a normal record of what was created.
      if (Object.keys(backfillCreated).length > 0) {
        await admin.from("audit_log").insert({
          user_id: uid,
          module: "admin_master",
          screen: "/teste-gratis",
          action: "trial_signup_backfill",
          entity: "partner_trials",
          role: existingTrial ? "system" : "public",
          status: "concluido",
          new_value: { email, ...backfillCreated, reused_trial: !!existingTrial },
        });
      }
    }

    const noteParts = [
      store_name ? `Loja: ${store_name}` : "",
      instagram ? `Instagram: ${instagram}` : "",
      city || state ? `Local: ${city}${city && state ? " / " : ""}${state}` : "",
    ].filter(Boolean);

    const ptPayload = {
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
    };
    let row: any = null;
    if (existingTrial?.id) {
      const { data: updated, error: uErr } = await admin
        .from("partner_trials")
        .update(ptPayload)
        .eq("id", existingTrial.id)
        .select()
        .single();
      if (uErr) return json({ error: uErr.message }, 500);
      row = updated;
    } else {
      const { data: inserted, error: ptErr } = await admin
        .from("partner_trials")
        .insert(ptPayload)
        .select()
        .single();
      if (ptErr) return json({ error: ptErr.message }, 500);
      row = inserted;
    }

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