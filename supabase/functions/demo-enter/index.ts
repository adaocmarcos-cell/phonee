import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEMO_EMAIL = "demo@phonee.com.br";
const DEMO_PASSWORD = "phonee-demo-2026";
const DEMO_STORE_SLUG = "loja-demonstracao-phonee";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Get or create demo user
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
    if (existing) {
      userId = existing.id;
      // Ensure password is the known demo password (idempotent reset)
      await admin.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD, email_confirm: true });
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Demonstração Phonee" },
      });
      if (error || !created.user) throw error ?? new Error("createUser failed");
      userId = created.user.id;
    }

    // 2. Get or create demo store
    let storeId: string | null = null;
    const { data: existingStore } = await admin.from("stores").select("id").eq("slug", DEMO_STORE_SLUG).maybeSingle();
    if (existingStore) {
      storeId = existingStore.id;
      await admin.from("stores").update({ owner_id: userId, name: "Loja Demonstração Phonee" }).eq("id", storeId);
    } else {
      const { data: newStore, error: sErr } = await admin.from("stores").insert({
        name: "Loja Demonstração Phonee",
        slug: DEMO_STORE_SLUG,
        owner_id: userId,
        trade_name: "Phonee Demo",
        phone: "(11) 99999-0000",
        email: "demo@phonee.com.br",
        address_city: "São Paulo",
        address_uf: "SP",
      }).select("id").single();
      if (sErr) throw sErr;
      storeId = newStore.id;
    }

    // 3. Ensure user_stores link + dono role
    await admin.from("user_stores").upsert({ user_id: userId, store_id: storeId });
    await admin.from("user_roles").upsert({ user_id: userId, store_id: storeId, role: "dono" }, { onConflict: "user_id,store_id,role" });

    // 4. Ensure active subscription
    const { data: anyPlan } = await admin.from("plans").select("id").eq("active", true).limit(1).maybeSingle();
    if (anyPlan) {
      const { data: existingSub } = await admin.from("subscriptions").select("id").eq("store_id", storeId).maybeSingle();
      if (!existingSub) {
        const { error: subInsErr } = await admin.from("subscriptions").insert({
          store_id: storeId,
          plan_id: anyPlan.id,
          customer_name: "Demonstração Phonee",
          customer_email: DEMO_EMAIL,
          customer_doc: "00000000000",
          payment_method: "PIX",
          status: "active",
          amount_cents: 0,
          billing_cycle: "lifetime",
        });
        if (subInsErr) console.error("subscription insert error", subInsErr);
      } else {
        await admin.from("subscriptions").update({ status: "active", billing_cycle: "lifetime" }).eq("id", existingSub.id);
      }
    }

    // 5. Reset & seed data (best-effort)
    await reseed(admin, storeId!, userId!);

    return new Response(JSON.stringify({ ok: true, email: DEMO_EMAIL, password: DEMO_PASSWORD }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("demo-enter error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function reseed(admin: any, storeId: string, userId: string) {
  // Wipe demo-only data
  await admin.from("sale_items").delete().in("sale_id",
    (await admin.from("sales").select("id").eq("store_id", storeId)).data?.map((r: any) => r.id) ?? [],
  );
  await admin.from("sales").delete().eq("store_id", storeId);
  await admin.from("service_orders").delete().eq("store_id", storeId);
  await admin.from("expenses").delete().eq("store_id", storeId);
  await admin.from("products").delete().eq("store_id", storeId);
  await admin.from("customers").delete().eq("store_id", storeId);

  // Customers
  const customersSeed = [
    { full: "Mariana Souza", phone: "(11) 98888-1111" },
    { full: "Carlos Andrade", phone: "(11) 98888-2222" },
    { full: "Patrícia Lima",  phone: "(11) 98888-3333" },
    { full: "Rafael Mendes",  phone: "(11) 98888-4444" },
    { full: "Juliana Castro", phone: "(11) 98888-5555" },
  ];
  const { data: customers } = await admin.from("customers").insert(
    customersSeed.map((c) => ({
      store_id: storeId, name: c.full, phone: c.phone, doc_type: "cpf",
      address_city: "São Paulo", address_uf: "SP",
    })),
  ).select("id, name");

  // Products
  const productsSeed = [
    { name: "iPhone 15 Pro 256GB Titânio", brand: "Apple",    category: "aparelho_novo",    cost: 6200, price: 8499, stock: 7 },
    { name: "iPhone 13 128GB Estelar",     brand: "Apple",    category: "aparelho_novo",    cost: 3100, price: 4299, stock: 5 },
    { name: "Galaxy S24 256GB Preto",      brand: "Samsung",  category: "aparelho_novo",    cost: 4200, price: 5799, stock: 4 },
    { name: "Galaxy A55 128GB Azul",       brand: "Samsung",  category: "aparelho_novo",    cost: 1850, price: 2599, stock: 9 },
    { name: "Xiaomi Redmi Note 13 Pro",    brand: "Xiaomi",   category: "aparelho_novo",    cost: 1200, price: 1799, stock: 12 },
    { name: "Motorola Edge 50 Fusion",     brand: "Motorola", category: "aparelho_novo",    cost: 1700, price: 2399, stock: 6 },
    { name: "Capa MagSafe iPhone 15 Pro",  brand: "Apple",    category: "acessorio",        cost: 90,   price: 199,  stock: 30 },
    { name: "Película 3D Galaxy S24",      brand: "Generic",  category: "acessorio",        cost: 8,    price: 39,   stock: 80 },
    { name: "Carregador USB-C 30W",        brand: "Anker",    category: "acessorio",        cost: 55,   price: 129,  stock: 25 },
    { name: "Fone AirPods Pro 2",          brand: "Apple",    category: "acessorio",        cost: 1450, price: 2199, stock: 8 },
    { name: "iPhone 12 64GB Seminovo",     brand: "Apple",    category: "aparelho_seminovo",cost: 1800, price: 2499, stock: 3 },
    { name: "Galaxy S22 128GB Seminovo",   brand: "Samsung",  category: "aparelho_seminovo",cost: 1600, price: 2299, stock: 2 },
  ];
  const { data: products, error: prodErr } = await admin.from("products").insert(
    productsSeed.map((p, i) => ({
      store_id: storeId, name: p.name, sku: `DEMO-${String(i + 1).padStart(3, "0")}`,
      brand: p.brand, category: p.category, condition: p.category === "aparelho_seminovo" ? "seminovo" : "novo",
      cost_price: p.cost, sale_price: p.price, stock_current: p.stock, stock_min: 1, stock_max: p.stock + 10,
      visible_in_catalog: true, status: "ativo",
    })),
  ).select("id, name, sale_price, cost_price");
  if (prodErr) console.error("seed products error", prodErr);

  // Sales over the last 30 days
  if (products && customers) {
    const methods = ["pix", "credito", "debito", "dinheiro"];
    const salesPayload: any[] = [];
    for (let i = 0; i < 24; i++) {
      const p = products[i % products.length];
      const c = customers[i % customers.length];
      const daysAgo = Math.floor(Math.random() * 30);
      const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
      salesPayload.push({
        store_id: storeId,
        seller_id: userId,
        customer_name: c.name,
        payment_method: methods[i % methods.length],
        installments: 1,
        discount: 0,
        subtotal: Number(p.sale_price),
        total: Number(p.sale_price),
        payment_status: "pago",
        created_at: createdAt,
        _product_id: p.id,
        _unit_price: Number(p.sale_price),
      });
    }
    const items = salesPayload.map((s) => ({ product_id: s._product_id, unit_price: s._unit_price, total: s._unit_price }));
    const cleaned = salesPayload.map(({ _product_id, _unit_price, ...rest }) => rest);
    const { data: insertedSales } = await admin.from("sales").insert(cleaned).select("id");
    if (insertedSales) {
      await admin.from("sale_items").insert(
        insertedSales.map((s: any, idx: number) => ({
          sale_id: s.id, product_id: items[idx].product_id,
          quantity: 1, unit_price: items[idx].unit_price, total: items[idx].total,
        })),
      );
    }
  }

  // Service orders
  if (customers) {
    const { error: osErr } = await admin.from("service_orders").insert([
      { store_id: storeId, customer_name: customers[0].name, customer_whatsapp: "(11) 98888-1111",
        device_category: "smartphone", device_brand: "Apple", device_model: "iPhone 13", device_color: "Estelar",
        issue_description: "Troca de tela quebrada", status: "em_reparo", reasons: ["tela_quebrada"] },
      { store_id: storeId, customer_name: customers[1].name, customer_whatsapp: "(11) 98888-2222",
        device_category: "smartphone", device_brand: "Samsung", device_model: "Galaxy S22",
        issue_description: "Bateria viciada — troca", status: "aguardando_aprovacao", reasons: ["bateria"] },
      { store_id: storeId, customer_name: customers[2].name, customer_whatsapp: "(11) 98888-3333",
        device_category: "smartphone", device_brand: "Xiaomi", device_model: "Redmi Note 12",
        issue_description: "Não liga após queda", status: "recebido", reasons: ["nao_liga"] },
      { store_id: storeId, customer_name: customers[3].name, customer_whatsapp: "(11) 98888-4444",
        device_category: "smartphone", device_brand: "Apple", device_model: "iPhone 11",
        issue_description: "Troca de conector de carga", status: "entregue", reasons: ["nao_carrega"] },
    ]);
    if (osErr) console.error("seed os error", osErr);
  }

  // Expenses
  await admin.from("expenses").insert([
    { store_id: storeId, category_name: "Aluguel", description: "Aluguel da loja", amount: 4500, expense_date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), payment_method: "boleto" },
    { store_id: storeId, category_name: "Energia elétrica", description: "Conta de luz", amount: 680, expense_date: new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10), payment_method: "boleto" },
    { store_id: storeId, category_name: "Internet", description: "Plano fibra 600MB", amount: 199, expense_date: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), payment_method: "pix" },
    { store_id: storeId, category_name: "Marketing", description: "Anúncios Instagram", amount: 1200, expense_date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), payment_method: "credito" },
    { store_id: storeId, category_name: "Salários", description: "Vendedor — mensalidade", amount: 2800, expense_date: new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10), payment_method: "transferencia" },
  ]);
}