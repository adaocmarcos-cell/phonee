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
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Não autenticado." }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Sessão inválida." }, 401);
    const callerId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ---------- Audit helper ----------
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    async function audit(
      auditAction: string,
      entity: string,
      entityId: string | null,
      details: Record<string, unknown> = {},
      status: "concluido" | "erro" = "concluido",
      storeId: string | null = null,
      oldValue: unknown = null,
      newValue: unknown = null,
    ) {
      try {
        await admin.from("audit_log").insert({
          user_id: callerId,
          store_id: storeId,
          module: "admin_master",
          screen: "phonee/admin",
          action: auditAction,
          entity,
          entity_id: entityId,
          role: "admin_master",
          status,
          ip,
          user_agent: ua,
          old_value: oldValue as any,
          new_value: newValue as any,
          details,
        });
      } catch (_e) { /* never block flow on audit failure */ }
    }

    // Only admin_master can call this
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isMaster = (callerRoles ?? []).some((r: any) => r.role === "admin_master");
    if (!isMaster) return json({ error: "Acesso restrito ao admin master." }, 403);

    const body = await req.json().catch(() => ({}));
    const { action, user_id, store_id } = body ?? {};
    if (!action) return json({ error: "Ação é obrigatória." }, 400);
    const noUserActions = new Set([
      "update_store",
      "delete_store",
      "create_user",
      "partner_create_trial",
      "partner_list",
      "create_partner_user",
    ]);
    if (!noUserActions.has(action) && !user_id) {
      return json({ error: "Usuário é obrigatório." }, 400);
    }
    if (user_id === callerId && (action === "delete" || action === "block")) {
      return json({ error: "Você não pode aplicar essa ação a si mesmo." }, 400);
    }

    if (action === "update") {
      const { full_name, email, phone, new_password, expires_at } = body;
      const authPatch: Record<string, unknown> = {};
      if (typeof email === "string" && email.trim()) authPatch.email = email.trim().toLowerCase();
      if (typeof new_password === "string" && new_password) {
        if (new_password.length < 8) return json({ error: "Senha mínima de 8 caracteres." }, 400);
        authPatch.password = new_password;
      }
      if (Object.keys(authPatch).length > 0) {
        const { error } = await admin.auth.admin.updateUserById(user_id, authPatch);
        if (error) return json({ error: error.message }, 400);
      }
      const profPatch: Record<string, unknown> = { id: user_id };
      if (typeof full_name === "string") profPatch.full_name = full_name.trim();
      if (typeof email === "string" && email.trim()) profPatch.email = email.trim().toLowerCase();
      if (typeof phone === "string") profPatch.phone = phone.trim() || null;
      if (Object.keys(profPatch).length > 1) {
        const { error } = await admin.from("profiles").upsert(profPatch);
        if (error) return json({ error: error.message }, 500);
      }
      if (expires_at !== undefined) {
        await admin.from("user_profile_extras").upsert(
          { user_id, expires_at: expires_at || null },
          { onConflict: "user_id" },
        );
      }
      await audit(
        new_password ? "user_reset_password" : "user_update",
        "users", user_id,
        {
          changed_fields: {
            full_name: typeof full_name === "string",
            email: typeof email === "string" && !!email.trim(),
            phone: typeof phone === "string",
            password: !!new_password,
            expires_at: expires_at !== undefined,
          },
          email: typeof email === "string" ? email : undefined,
          expires_at: expires_at ?? undefined,
        },
      );
      return json({ ok: true });
    }

    // Manual creation of a regular user (with optional expiration)
    if (action === "create_user") {
      const { email, full_name, password, phone, expires_at, send_recovery } = body;
      if (typeof email !== "string" || !email.trim()) return json({ error: "E-mail é obrigatório." }, 400);
      if (password && password.length < 8) return json({ error: "Senha mínima de 8 caracteres." }, 400);
      const finalPass = password || crypto.randomUUID().slice(0, 12) + "Aa1!";
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password: finalPass,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? "" },
      });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? "Falha ao criar usuário." }, 400);
      const uid = created.user.id;
      await admin.from("profiles").upsert({
        id: uid,
        full_name: (full_name ?? "").trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
      });
      if (expires_at) {
        await admin.from("user_profile_extras").upsert(
          { user_id: uid, expires_at },
          { onConflict: "user_id" },
        );
      }
      let recoveryLink: string | null = null;
      if (send_recovery) {
        const { data: link } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: email.trim().toLowerCase(),
        });
        recoveryLink = (link as any)?.properties?.action_link ?? null;
      }
      await audit("user_create_manual", "users", uid, {
        email: email.trim().toLowerCase(),
        full_name: full_name ?? null,
        expires_at: expires_at ?? null,
        sent_recovery: !!send_recovery,
      });
      return json({ ok: true, user_id: uid, password: password ? undefined : finalPass, recovery_link: recoveryLink });
    }

    // ============ Partner trials (7 days + 12 months manual) ============
    // Quick partner user: fixed password 1234567890, 7 days expiration,
    // force password change on first login. Returns the private access URL.
    if (action === "create_partner_user") {
      const { email, full_name, whatsapp, access_origin } = body;
      if (typeof email !== "string" || !email.trim())
        return json({ error: "E-mail é obrigatório." }, 400);
      const cleanEmail = email.trim().toLowerCase();
      const DEFAULT_PASS = "1234567890";
      const trialDays = 7;
      const trialEnds = new Date(Date.now() + trialDays * 86400_000);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: DEFAULT_PASS,
        email_confirm: true,
        user_metadata: {
          full_name: full_name ?? "",
          partner_trial: true,
          must_change_password: true,
        },
      });
      if (cErr || !created?.user) {
        return json({ error: cErr?.message ?? "Falha ao criar parceiro." }, 400);
      }
      const uid = created.user.id;
      await admin.from("profiles").upsert({
        id: uid,
        full_name: (full_name ?? "").trim(),
        email: cleanEmail,
        phone: whatsapp?.trim() || null,
      });
      await admin.from("user_profile_extras").upsert(
        { user_id: uid, expires_at: trialEnds.toISOString(), status: "ativo" },
        { onConflict: "user_id" },
      );

      // Record in partner_trials so it shows in Parceiros panel too
      const { data: pt } = await admin
        .from("partner_trials")
        .insert({
          user_id: uid,
          email: cleanEmail,
          full_name: full_name ?? null,
          whatsapp: whatsapp?.trim() || null,
          invited_by: callerId,
          activated_at: new Date().toISOString(),
          trial_days: trialDays,
          trial_ends_at: trialEnds.toISOString(),
          full_access_months: 12,
          status: "em_teste",
          notes: "Criado via Usuários · senha padrão 1234567890",
        })
        .select()
        .single();

      const origin = typeof access_origin === "string" && access_origin.startsWith("http")
        ? access_origin.replace(/\/+$/, "")
        : "https://phonee.com.br";
      const accessUrl = `${origin}/entrar?partner=1&email=${encodeURIComponent(cleanEmail)}`;

      await audit("partner_user_create", "users", uid, {
        email: cleanEmail,
        full_name: full_name ?? null,
        expires_at: trialEnds.toISOString(),
        force_password_change: true,
        partner_trial_id: (pt as any)?.id ?? null,
      });

      return json({
        ok: true,
        user_id: uid,
        email: cleanEmail,
        temp_password: DEFAULT_PASS,
        expires_at: trialEnds.toISOString(),
        access_url: accessUrl,
        partner_trial_id: (pt as any)?.id ?? null,
      });
    }

    if (action === "partner_create_trial") {
      const { email, full_name, whatsapp, trial_days, full_access_months, notes } = body;
      if (typeof email !== "string" || !email.trim()) return json({ error: "E-mail é obrigatório." }, 400);
      const cleanEmail = email.trim().toLowerCase();
      const tDays = Number(trial_days) > 0 ? Number(trial_days) : 7;
      const fMonths = Number(full_access_months) > 0 ? Number(full_access_months) : 12;

      // Create or get user
      let uid: string | null = null;
      const tempPass = crypto.randomUUID().slice(0, 8) + "Aa1!";
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: tempPass,
        email_confirm: true,
        user_metadata: { full_name: full_name ?? "", partner_trial: true },
      });
      if (cErr && !/already.*registered|exists/i.test(cErr.message)) {
        return json({ error: cErr.message }, 400);
      }
      if (created?.user) {
        uid = created.user.id;
      } else {
        // find existing
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        uid = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === cleanEmail)?.id ?? null;
      }

      await admin.from("profiles").upsert({
        id: uid!,
        full_name: (full_name ?? "").trim(),
        email: cleanEmail,
        phone: whatsapp?.trim() || null,
      });

      const now = new Date();
      const trialEnds = new Date(now.getTime() + tDays * 86400_000);

      // Magic link for the partner
      const { data: link } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: cleanEmail,
      });
      const inviteLink = (link as any)?.properties?.action_link ?? null;

      const { data: row, error: ptErr } = await admin
        .from("partner_trials")
        .insert({
          user_id: uid,
          email: cleanEmail,
          full_name: full_name ?? null,
          whatsapp: whatsapp?.trim() || null,
          notes: notes ?? null,
          invited_by: callerId,
          activated_at: now.toISOString(),
          trial_days: tDays,
          trial_ends_at: trialEnds.toISOString(),
          full_access_months: fMonths,
          status: "em_teste",
          invite_link: inviteLink,
        })
        .select()
        .single();
      if (ptErr) return json({ error: ptErr.message }, 500);

      // also record expires_at on extras for visibility (= trial_ends_at)
      if (uid) {
        await admin.from("user_profile_extras").upsert(
          { user_id: uid, expires_at: trialEnds.toISOString() },
          { onConflict: "user_id" },
        );
      }

      await audit("partner_create_trial", "partner_trials", (row as any)?.id ?? null, {
        email: cleanEmail,
        full_name: full_name ?? null,
        whatsapp: whatsapp ?? null,
        trial_days: tDays,
        full_access_months: fMonths,
        invite_link_generated: !!inviteLink,
      });
      return json({ ok: true, trial: row, invite_link: inviteLink, temp_password: tempPass });
    }

    if (action === "partner_release_full") {
      const { trial_id, months, start_at } = body;
      if (!trial_id) return json({ error: "trial_id é obrigatório." }, 400);
      const { data: tr, error: tErr } = await admin
        .from("partner_trials").select("*").eq("id", trial_id).maybeSingle();
      if (tErr || !tr) return json({ error: tErr?.message ?? "Parceiro não encontrado." }, 404);
      const m = Number(months) > 0 ? Number(months) : (tr.full_access_months ?? 12);
      const start = start_at ? new Date(start_at) : new Date();
      const end = new Date(start.getTime() + m * 30 * 86400_000);
      const { error: upErr } = await admin.from("partner_trials").update({
        full_access_granted_at: start.toISOString(),
        full_access_months: m,
        full_access_ends_at: end.toISOString(),
        status: "liberado",
      }).eq("id", trial_id);
      if (upErr) return json({ error: upErr.message }, 500);
      // unblock user and align extras expiration
      if (tr.user_id) {
        await admin.auth.admin.updateUserById(tr.user_id, { ban_duration: "none" } as any);
        await admin.from("user_profile_extras").upsert(
          { user_id: tr.user_id, expires_at: end.toISOString(), status: "ativo" },
          { onConflict: "user_id" },
        );
      }
      await audit("partner_release_full", "partner_trials", trial_id, {
        email: tr.email, months: m, start_at: start.toISOString(),
        full_access_ends_at: end.toISOString(),
      });
      return json({ ok: true, full_access_ends_at: end.toISOString() });
    }

    if (action === "partner_revoke") {
      const { trial_id } = body;
      if (!trial_id) return json({ error: "trial_id é obrigatório." }, 400);
      const { data: tr } = await admin.from("partner_trials").select("user_id").eq("id", trial_id).maybeSingle();
      await admin.from("partner_trials").update({ status: "revogado" }).eq("id", trial_id);
      if (tr?.user_id) {
        await admin.auth.admin.updateUserById(tr.user_id, { ban_duration: "876000h" } as any);
        await admin.from("user_profile_extras").upsert(
          { user_id: tr.user_id, status: "inativo" },
          { onConflict: "user_id" },
        );
      }
      await audit("partner_revoke", "partner_trials", trial_id, {});
      return json({ ok: true });
    }

    if (action === "partner_reactivate") {
      const { trial_id, trial_days } = body;
      if (!trial_id) return json({ error: "trial_id é obrigatório." }, 400);
      const { data: tr } = await admin.from("partner_trials").select("user_id, trial_days").eq("id", trial_id).maybeSingle();
      const days = Number(trial_days) > 0 ? Number(trial_days) : (tr?.trial_days ?? 7);
      const now = new Date();
      const ends = new Date(now.getTime() + days * 86400_000);
      const { error: upErr } = await admin.from("partner_trials").update({
        status: "em_teste",
        activated_at: now.toISOString(),
        trial_days: days,
        trial_ends_at: ends.toISOString(),
      }).eq("id", trial_id);
      if (upErr) return json({ error: upErr.message }, 500);
      if (tr?.user_id) {
        await admin.auth.admin.updateUserById(tr.user_id, { ban_duration: "none" } as any);
        await admin.from("user_profile_extras").upsert(
          { user_id: tr.user_id, status: "ativo", expires_at: ends.toISOString() },
          { onConflict: "user_id" },
        );
      }
      await audit("partner_reactivate", "partner_trials", trial_id, { trial_days: days });
      return json({ ok: true, trial_ends_at: ends.toISOString() });
    }

    if (action === "partner_regenerate_link") {
      const { trial_id } = body;
      if (!trial_id) return json({ error: "trial_id é obrigatório." }, 400);
      const { data: tr } = await admin.from("partner_trials").select("email").eq("id", trial_id).maybeSingle();
      if (!tr?.email) return json({ error: "Parceiro não encontrado." }, 404);
      const { data: link, error: lErr } = await admin.auth.admin.generateLink({
        type: "recovery", email: tr.email,
      });
      if (lErr) return json({ error: lErr.message }, 400);
      const url = (link as any)?.properties?.action_link ?? null;
      await admin.from("partner_trials").update({ invite_link: url }).eq("id", trial_id);
      await audit("partner_regenerate_link", "partner_trials", trial_id, { email: tr.email, link_generated: !!url });
      return json({ ok: true, invite_link: url });
    }

    if (action === "partner_delete") {
      const { trial_id, delete_user } = body;
      if (!trial_id) return json({ error: "trial_id é obrigatório." }, 400);
      const { data: tr } = await admin.from("partner_trials").select("user_id").eq("id", trial_id).maybeSingle();
      await admin.from("partner_trials").delete().eq("id", trial_id);
      if (delete_user && tr?.user_id) {
        await admin.auth.admin.deleteUser(tr.user_id);
      }
      await audit("partner_delete", "partner_trials", trial_id, { also_deleted_user: !!delete_user });
      return json({ ok: true });
    }

    if (action === "block") {
      // Ban for 100 years
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: "876000h",
      } as any);
      if (error) return json({ error: error.message }, 400);
      // Mark all extras as inativo
      await admin.from("user_profile_extras").update({ status: "inativo" }).eq("user_id", user_id);
      await audit("user_block", "users", user_id, {});
      return json({ ok: true });
    }

    if (action === "unblock") {
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      } as any);
      if (error) return json({ error: error.message }, 400);
      await admin.from("user_profile_extras").update({ status: "ativo" }).eq("user_id", user_id);
      await audit("user_unblock", "users", user_id, {});
      return json({ ok: true });
    }

    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      await audit("user_delete", "users", user_id, {});
      return json({ ok: true });
    }

    if (action === "update_store") {
      if (!store_id) return json({ error: "Loja é obrigatória." }, 400);
      const { store_name } = body;
      const patch: Record<string, unknown> = {};
      if (typeof store_name === "string") {
        if (!store_name.trim()) return json({ error: "Nome da loja é obrigatório." }, 400);
        patch.name = store_name.trim();
      }
      if (Object.keys(patch).length === 0) return json({ ok: true });
      const { error } = await admin.from("stores").update(patch).eq("id", store_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete_store") {
      if (!store_id) return json({ error: "Loja é obrigatória." }, 400);
      const { confirm_name } = body;
      // Load store for audit + name validation
      const { data: store, error: loadErr } = await admin
        .from("stores")
        .select("id, name, slug, owner_id, created_at")
        .eq("id", store_id)
        .maybeSingle();
      if (loadErr) return json({ error: loadErr.message }, 500);
      if (!store) return json({ error: "Loja não encontrada." }, 404);
      if (store.slug === "loja-demonstracao-phonee") {
        return json({ error: "A loja de demonstração não pode ser excluída." }, 400);
      }
      if (typeof confirm_name !== "string" || confirm_name.trim() !== store.name) {
        return json({ error: "Confirmação inválida: digite o nome exato da loja." }, 400);
      }

      // Caller profile (for audit context)
      const { data: callerProfile } = await admin
        .from("profiles").select("email, full_name").eq("id", callerId).maybeSingle();

      // Audit BEFORE delete (so it survives even if cascades remove related rows)
      const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
      const ua = req.headers.get("user-agent") ?? null;
      await admin.from("audit_log").insert({
        user_id: callerId,
        store_id: store.id,
        module: "admin_master",
        screen: "phonee/lojas",
        action: "delete_store",
        entity: "stores",
        entity_id: store.id,
        role: "admin_master",
        status: "concluido",
        ip,
        user_agent: ua,
        old_value: store as any,
        details: {
          executed_by: {
            user_id: callerId,
            email: callerProfile?.email ?? null,
            full_name: callerProfile?.full_name ?? null,
          },
          confirm_name,
          deleted_at: new Date().toISOString(),
        },
      });

      const { error: delErr } = await admin.from("stores").delete().eq("id", store.id);
      if (delErr) {
        // Mark audit as failed
        await admin.from("audit_log").insert({
          user_id: callerId,
          store_id: store.id,
          module: "admin_master",
          screen: "phonee/lojas",
          action: "delete_store_failed",
          entity: "stores",
          entity_id: store.id,
          role: "admin_master",
          status: "erro",
          details: { error: delErr.message },
        });
        return json({ error: delErr.message }, 500);
      }
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});