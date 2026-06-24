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

    // Only admin_master can call this
    const { data: callerRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isMaster = (callerRoles ?? []).some((r: any) => r.role === "admin_master");
    if (!isMaster) return json({ error: "Acesso restrito ao admin master." }, 403);

    const body = await req.json().catch(() => ({}));
    const { action, user_id } = body ?? {};
    if (!action || !user_id) return json({ error: "Ação e usuário são obrigatórios." }, 400);
    if (user_id === callerId && (action === "delete" || action === "block")) {
      return json({ error: "Você não pode aplicar essa ação a si mesmo." }, 400);
    }

    if (action === "update") {
      const { full_name, email, phone, new_password } = body;
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
      return json({ ok: true });
    }

    if (action === "unblock") {
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      } as any);
      if (error) return json({ error: error.message }, 400);
      await admin.from("user_profile_extras").update({ status: "ativo" }).eq("user_id", user_id);
      return json({ ok: true });
    }

    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});