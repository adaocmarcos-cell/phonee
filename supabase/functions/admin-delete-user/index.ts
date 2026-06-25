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
    const { user_id = "", store_id = "", hard_delete = false } = body ?? {};
    if (!user_id || !store_id) return json({ error: "Usuário e loja são obrigatórios." }, 400);
    if (user_id === callerId) return json({ error: "Você não pode remover a si mesmo." }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize caller on this store (owner/admin only — gerente não pode excluir)
    const { data: callerRoles, error: callerRolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("store_id", store_id);
    if (callerRolesErr) return json({ error: callerRolesErr.message }, 500);
    const allowed = (callerRoles ?? []).some((r: any) =>
      ["admin_master", "dono", "administrador"].includes(r.role),
    );
    if (!allowed) return json({ error: "Sem permissão para remover colaboradores." }, 403);

    // Cannot remove the store owner
    const { data: store } = await admin.from("stores").select("owner_id").eq("id", store_id).maybeSingle();
    if (store?.owner_id === user_id) {
      return json({ error: "Não é possível remover o proprietário da loja." }, 400);
    }

    // Remove vínculos com esta loja
    await admin.from("user_roles").delete().eq("user_id", user_id).eq("store_id", store_id);
    await admin.from("user_stores").delete().eq("user_id", user_id).eq("store_id", store_id);
    await admin.from("user_profile_extras").delete().eq("user_id", user_id).eq("store_id", store_id);

    // Se o usuário não está vinculado a nenhuma outra loja e hard_delete = true, remove a conta
    if (hard_delete) {
      const { data: otherRoles } = await admin
        .from("user_roles")
        .select("store_id")
        .eq("user_id", user_id);
      const { data: otherStores } = await admin
        .from("user_stores")
        .select("store_id")
        .eq("user_id", user_id);
      const stillLinked = (otherRoles?.length ?? 0) > 0 || (otherStores?.length ?? 0) > 0;
      if (!stillLinked) {
        await admin.auth.admin.deleteUser(user_id).catch(() => null);
      }
    }

    // Auditoria
    await admin.from("audit_log").insert({
      store_id,
      user_id: callerId,
      module: "usuarios",
      action: "remover_colaborador",
      entity: "user",
      entity_id: user_id,
      details: { hard_delete },
      status: "ok",
    });

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});