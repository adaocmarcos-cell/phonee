// Seed and cleanup for the RLS E2E test. Gated by TEST_SEED_TOKEN secret so it
// cannot be triggered casually in production.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-test-seed-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const PREFIX = "e2e_rls_";
const PASSWORD = "E2eTest!123456";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const expected = Deno.env.get("TEST_SEED_TOKEN");
    if (!expected) return json({ error: "TEST_SEED_TOKEN not configured" }, 500);
    if (req.headers.get("x-test-seed-token") !== expected) return json({ error: "forbidden" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "seed";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "cleanup") {
      // remove seeded stores and users
      const { data: stores } = await admin.from("stores").select("id, name").ilike("name", `${PREFIX}%`);
      const storeIds = (stores ?? []).map((s: any) => s.id);
      if (storeIds.length) {
        await admin.from("sale_items").delete().in("sale_id",
          (await admin.from("sales").select("id").in("store_id", storeIds)).data?.map((s: any) => s.id) ?? []);
        await admin.from("sales").delete().in("store_id", storeIds);
        await admin.from("purchase_order_items").delete().in("order_id",
          (await admin.from("purchase_orders").select("id").in("store_id", storeIds)).data?.map((o: any) => o.id) ?? []);
        await admin.from("purchase_orders").delete().in("store_id", storeIds);
        await admin.from("user_stores").delete().in("store_id", storeIds);
        await admin.from("user_roles").delete().in("store_id", storeIds);
        await admin.from("stores").delete().in("id", storeIds);
      }
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users?.users ?? []) {
        if (u.email && u.email.startsWith(PREFIX)) {
          await admin.auth.admin.deleteUser(u.id);
        }
      }
      return json({ ok: true, cleaned: storeIds.length });
    }

    // seed
    const users = [
      { key: "owner_a",   email: `${PREFIX}owner_a@test.local`,   role: "dono" },
      { key: "manager_a", email: `${PREFIX}manager_a@test.local`, role: "gerente" },
      { key: "seller_a",  email: `${PREFIX}seller_a@test.local`,  role: "vendedor" },
      { key: "owner_b",   email: `${PREFIX}owner_b@test.local`,   role: "dono" },
    ];
    const ids: Record<string, string> = {};
    for (const u of users) {
      const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing.data.users.find((x) => x.email === u.email);
      if (found) { ids[u.key] = found.id; continue; }
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email, password: PASSWORD, email_confirm: true,
      });
      if (error) return json({ error: `createUser ${u.email}: ${error.message}` }, 500);
      ids[u.key] = data.user!.id;
    }

    const { data: storeA, error: sae } = await admin.from("stores").insert({
      name: `${PREFIX}store_A`, owner_id: ids.owner_a,
    }).select("id").single();
    if (sae) return json({ error: `store A: ${sae.message}` }, 500);
    const { data: storeB, error: sbe } = await admin.from("stores").insert({
      name: `${PREFIX}store_B`, owner_id: ids.owner_b,
    }).select("id").single();
    if (sbe) return json({ error: `store B: ${sbe.message}` }, 500);

    const bind = async (uid: string, sid: string, role: string) => {
      await admin.from("user_stores").upsert({ user_id: uid, store_id: sid });
      await admin.from("user_roles").upsert({ user_id: uid, store_id: sid, role });
    };
    await bind(ids.owner_a, storeA.id, "dono");
    await bind(ids.manager_a, storeA.id, "gerente");
    await bind(ids.seller_a, storeA.id, "vendedor");
    await bind(ids.owner_b, storeB.id, "dono");

    const { data: sale } = await admin.from("sales").insert({
      store_id: storeA.id, user_id: ids.owner_a, subtotal: 100, total: 100, status: "paga",
    }).select("id").single();

    const { data: po } = await admin.from("purchase_orders").insert({
      store_id: storeA.id, user_id: ids.owner_a, total: 100, status: "aberto",
    }).select("id").single();

    return json({
      ok: true,
      password: PASSWORD,
      users,
      store_a_id: storeA.id, store_b_id: storeB.id,
      sale_id: sale?.id, purchase_order_id: po?.id,
    });
  } catch (e: any) {
    return json({ error: e.message ?? String(e) }, 500);
  }
});
