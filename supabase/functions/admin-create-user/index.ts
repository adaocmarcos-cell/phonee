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
      full_name = "",
      email = "",
      phone = "",
      password = "",
      role = "vendedor",
      job_title = "",
      store_id = "",
      permissions = {},
    } = body ?? {};

    if (!email || !password || !store_id) {
      return json({ error: "E-mail, senha e loja são obrigatórios." }, 400);
    }
    if (!String(full_name).trim()) {
      return json({ error: "Nome completo é obrigatório." }, 400);
    }
    if (String(password).length < 8) {
      return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Authorize caller: must have admin/manager role on the target store
    const { data: callerRoles, error: callerRolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("store_id", store_id);
    if (callerRolesErr) return json({ error: callerRolesErr.message }, 500);
    const allowed = (callerRoles ?? []).some((r: any) =>
      ["admin_master", "dono", "administrador", "gerente"].includes(r.role),
    );
    if (!allowed) return json({ error: "Sem permissão para cadastrar colaboradores." }, 403);

    // Create auth user (confirmed)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name, phone },
    });
    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? "Falha ao criar usuário." }, 400);
    }
    const newUserId = created.user.id;

    // Upsert profile
    const { error: profErr } = await admin.from("profiles").upsert({
      id: newUserId,
      full_name: full_name || null,
      email: String(email).trim().toLowerCase(),
      phone: phone || null,
    });
    if (profErr) return json({ error: profErr.message }, 500);

    // Insert role binding
    const { error: roleErr } = await admin.from("user_roles").insert({
      user_id: newUserId,
      role,
      store_id,
    });
    if (roleErr) return json({ error: roleErr.message }, 500);

    // Link user to store (required for my_stores / store access)
    const { error: linkErr } = await admin
      .from("user_stores")
      .upsert({ user_id: newUserId, store_id }, { onConflict: "user_id,store_id" });
    if (linkErr) return json({ error: linkErr.message }, 500);

    // Extras (job_title/status)
    const { error: extraErr } = await admin.from("user_profile_extras").upsert({
      user_id: newUserId,
      store_id,
      job_title: job_title || null,
      status: "ativo",
      permissions: permissions ?? {},
    });
    if (extraErr) return json({ error: extraErr.message }, 500);

    return json({ ok: true, user_id: newUserId });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro inesperado" }, 500);
  }
});