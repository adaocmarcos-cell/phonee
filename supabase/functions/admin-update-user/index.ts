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

    const body = await req.json().catch(() => ({}));
    const {
      user_id = "",
      store_id = "",
      full_name,
      email,
      phone,
      role,
      job_title,
      status,
      permissions,
      new_password,
    } = body ?? {};

    if (!user_id || !store_id) {
      return json({ error: "Usuário e loja são obrigatórios." }, 400);
    }
    if (typeof full_name === "string" && !full_name.trim()) {
      return json({ error: "O nome do colaborador é obrigatório." }, 400);
    }
    if (typeof email === "string" && !email.trim()) {
      return json({ error: "O e-mail do colaborador é obrigatório." }, 400);
    }
    if (typeof new_password === "string" && new_password && new_password.length < 8) {
      return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize caller on this store
    const { data: callerRoles, error: callerRolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("store_id", store_id);
    if (callerRolesErr) return json({ error: callerRolesErr.message }, 500);
    const allowed = (callerRoles ?? []).some((r: any) =>
      ["admin_master", "dono", "administrador", "gerente"].includes(r.role),
    );
    if (!allowed) return json({ error: "Sem permissão para editar colaboradores." }, 403);

    // Confirm target user belongs to this store
    const { data: targetRoles, error: targetErr } = await admin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", user_id)
      .eq("store_id", store_id);
    if (targetErr) return json({ error: targetErr.message }, 500);
    if (!targetRoles || targetRoles.length === 0) {
      return json({ error: "Colaborador não pertence a esta loja." }, 404);
    }

    // Update auth (email/password) when provided
    const authUpdate: Record<string, unknown> = {};
    if (typeof email === "string" && email.trim()) authUpdate.email = email.trim().toLowerCase();
    if (typeof new_password === "string" && new_password) authUpdate.password = new_password;
    if (Object.keys(authUpdate).length > 0) {
      const { error: authErr } = await admin.auth.admin.updateUserById(user_id, authUpdate);
      if (authErr) return json({ error: authErr.message }, 400);
    }

    // Upsert profile
    const profilePatch: Record<string, unknown> = { id: user_id };
    if (typeof full_name === "string") profilePatch.full_name = full_name.trim();
    if (typeof email === "string" && email.trim()) profilePatch.email = email.trim().toLowerCase();
    if (typeof phone === "string") profilePatch.phone = phone.trim() || null;
    if (Object.keys(profilePatch).length > 1) {
      const { error: profErr } = await admin.from("profiles").upsert(profilePatch);
      if (profErr) return json({ error: profErr.message }, 500);
    }

    // Update role: keep a single role per user/store for simplicity
    if (typeof role === "string" && role) {
      const { error: delErr } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .eq("store_id", store_id);
      if (delErr) return json({ error: delErr.message }, 500);
      const { error: insErr } = await admin
        .from("user_roles")
        .insert({ user_id, store_id, role });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    // Extras
    const extrasPatch: Record<string, unknown> = { user_id, store_id };
    let hasExtras = false;
    if (typeof job_title === "string") { extrasPatch.job_title = job_title.trim() || null; hasExtras = true; }
    if (typeof status === "string") { extrasPatch.status = status; hasExtras = true; }
    if (permissions && typeof permissions === "object") { extrasPatch.permissions = permissions; hasExtras = true; }
    if (hasExtras) {
      const { error: extraErr } = await admin
        .from("user_profile_extras")
        .upsert(extrasPatch, { onConflict: "user_id" });
      if (extraErr) return json({ error: extraErr.message }, 500);
    }

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});