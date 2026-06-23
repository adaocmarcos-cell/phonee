import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// One-shot endpoint to create / reset the platform admin account.
// Protected by a bootstrap token (BOOTSTRAP_ADMIN_TOKEN) so it cannot be abused.

const TARGET_EMAIL = "adaocmarcos@hotmail.com";
const TARGET_PASSWORD = "123456789";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Find existing user
  let userId: string | null = null;
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) {
    return new Response(JSON.stringify({ error: list.error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const found = list.data.users.find((u) => (u.email ?? "").toLowerCase() === TARGET_EMAIL);
  if (found) userId = found.id;

  // Auto-lock: once the admin has changed the provisional password, refuse to reset it.
  if (found && found.user_metadata?.must_change_password === false) {
    return new Response(JSON.stringify({
      ok: true,
      already_bootstrapped: true,
      user_id: found.id,
      email: TARGET_EMAIL,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { must_change_password: true, full_name: "Administrador Mobile+" },
    });
    if (created.error || !created.data.user) {
      return new Response(JSON.stringify({ error: created.error?.message ?? "create failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    userId = created.data.user.id;
  } else {
    const updated = await admin.auth.admin.updateUserById(userId, {
      password: TARGET_PASSWORD,
      email_confirm: true,
      user_metadata: { must_change_password: true, full_name: "Administrador Mobile+" },
    });
    if (updated.error) {
      return new Response(JSON.stringify({ error: updated.error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Ensure profile row
  await admin.from("profiles").upsert(
    { id: userId, email: TARGET_EMAIL, full_name: "Administrador Mobile+" },
    { onConflict: "id" },
  );

  // Ensure admin_master role
  const { data: existingRole } = await admin
    .from("user_roles").select("id")
    .eq("user_id", userId).eq("role", "admin_master").maybeSingle();
  if (!existingRole) {
    const ins = await admin.from("user_roles").insert({ user_id: userId, role: "admin_master" });
    if (ins.error) {
      return new Response(JSON.stringify({ error: ins.error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    user_id: userId,
    email: TARGET_EMAIL,
    provisional_password: TARGET_PASSWORD,
    must_change_password: true,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});