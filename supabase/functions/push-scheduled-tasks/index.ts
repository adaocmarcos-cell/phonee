// Tarefa agendada: contas a vencer (diário) + relatório mensal (dia 1).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callSend(event: string, store_id: string, payload: any) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ event, store_id, payload }),
    });
  } catch (e) { console.error("callSend", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const url = new URL(req.url);
  const task = url.searchParams.get("task") ?? "daily";
  const results: any = { task };

  // ============ TAREFA DIÁRIA: contas a pagar vencendo (próx. 3 dias) ============
  if (task === "daily" || task === "bills") {
    const today = new Date();
    const in3 = new Date(today.getTime() + 3 * 86400000);
    const fromISO = today.toISOString().slice(0, 10);
    const toISO = in3.toISOString().slice(0, 10);

    // Agrupa por loja
    const { data: bills } = await admin
      .from("expenses")
      .select("store_id,amount,description,expense_date")
      .gte("expense_date", fromISO)
      .lte("expense_date", toISO);

    const byStore = new Map<string, { count: number; total: number }>();
    (bills ?? []).forEach((b: any) => {
      if (!b.store_id) return;
      const cur = byStore.get(b.store_id) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(b.amount ?? 0);
      byStore.set(b.store_id, cur);
    });

    for (const [storeId, info] of byStore.entries()) {
      await callSend("bill_due", storeId, info);
    }
    results.bills_stores = byStore.size;
  }

  // ============ TAREFA MENSAL: relatório do mês anterior ============
  if (task === "monthly") {
    const now = new Date();
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fromISO = firstLastMonth.toISOString();
    const toISO = firstThisMonth.toISOString();
    const monthLabel = firstLastMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const monthKey = firstLastMonth.toISOString().slice(0, 7);

    const { data: sales } = await admin
      .from("sales").select("store_id,total")
      .gte("created_at", fromISO).lt("created_at", toISO);
    const { data: expenses } = await admin
      .from("expenses").select("store_id,amount")
      .gte("expense_date", fromISO.slice(0, 10)).lt("expense_date", toISO.slice(0, 10));

    const byStore = new Map<string, { sales: number; costs: number }>();
    (sales ?? []).forEach((r: any) => {
      if (!r.store_id) return;
      const c = byStore.get(r.store_id) ?? { sales: 0, costs: 0 };
      c.sales += Number(r.total ?? 0);
      byStore.set(r.store_id, c);
    });
    (expenses ?? []).forEach((r: any) => {
      if (!r.store_id) return;
      const c = byStore.get(r.store_id) ?? { sales: 0, costs: 0 };
      c.costs += Number(r.amount ?? 0);
      byStore.set(r.store_id, c);
    });

    for (const [storeId, agg] of byStore.entries()) {
      const profit = agg.sales - agg.costs;
      await callSend("monthly_report", storeId, {
        month_label: monthLabel, month_key: monthKey,
        sales: agg.sales, costs: agg.costs, profit,
      });
    }
    results.monthly_stores = byStore.size;
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});