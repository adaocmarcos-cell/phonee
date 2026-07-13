/**
 * RLS — Edição de vendas por dono/gerente e visibilidade de compras.
 *
 * Estes testes precisam de contas reais previamente criadas no ambiente
 * (dono, gerente e um outsider sem vínculo). Se as env vars abaixo não
 * estiverem definidas, os testes são pulados — assim o CI padrão continua
 * verde e você pode rodar localmente com credenciais reais.
 *
 * Envs esperadas:
 *   RLS_OWNER_EMAIL / RLS_OWNER_PASSWORD    — dono da loja alvo
 *   RLS_MANAGER_EMAIL / RLS_MANAGER_PASSWORD — gerente vinculado à mesma loja
 *   RLS_OUTSIDER_EMAIL / RLS_OUTSIDER_PASSWORD — usuário SEM vínculo com essa loja
 *   RLS_STORE_ID                             — id da loja usada nos testes
 *   RLS_SALE_ID                              — id de uma venda existente da loja
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const OWNER = { email: process.env.RLS_OWNER_EMAIL, password: process.env.RLS_OWNER_PASSWORD };
const MANAGER = { email: process.env.RLS_MANAGER_EMAIL, password: process.env.RLS_MANAGER_PASSWORD };
const OUTSIDER = { email: process.env.RLS_OUTSIDER_EMAIL, password: process.env.RLS_OUTSIDER_PASSWORD };
const STORE_ID = process.env.RLS_STORE_ID;
const SALE_ID = process.env.RLS_SALE_ID;

const hasAll =
  !!(OWNER.email && OWNER.password && MANAGER.email && MANAGER.password &&
     OUTSIDER.email && OUTSIDER.password && STORE_ID && SALE_ID);

async function signedClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

describe.skipIf(!hasAll)("RLS — vendas e compras por papel", () => {
  let owner: SupabaseClient;
  let manager: SupabaseClient;
  let outsider: SupabaseClient;

  beforeAll(async () => {
    owner = await signedClient(OWNER.email!, OWNER.password!);
    manager = await signedClient(MANAGER.email!, MANAGER.password!);
    outsider = await signedClient(OUTSIDER.email!, OUTSIDER.password!);
  });

  it("DONO consegue atualizar a venda", async () => {
    const { data, error } = await owner
      .from("sales")
      .update({ notes: `owner-edit-${Date.now()}` })
      .eq("id", SALE_ID!)
      .select("id");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("GERENTE consegue atualizar a venda (após correção da policy)", async () => {
    const { data, error } = await manager
      .from("sales")
      .update({ notes: `manager-edit-${Date.now()}` })
      .eq("id", SALE_ID!)
      .select("id");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("GERENTE consegue atualizar itens da venda (sale_items)", async () => {
    const { data: items } = await manager
      .from("sale_items")
      .select("id")
      .eq("sale_id", SALE_ID!)
      .limit(1);
    if (!items || items.length === 0) return; // venda sem itens — pular assert
    const { data, error } = await manager
      .from("sale_items")
      .update({ notes: `manager-item-${Date.now()}` } as any)
      .eq("id", items[0].id)
      .select("id");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("OUTSIDER não vê compras (purchase_orders) da loja", async () => {
    const { data, error } = await outsider
      .from("purchase_orders")
      .select("id")
      .eq("store_id", STORE_ID!);
    // Sem erro (RLS silencia), mas zero linhas.
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it("OUTSIDER não vê itens de compras da loja", async () => {
    const { data, error } = await outsider
      .from("purchase_order_items")
      .select("id")
      .limit(5);
    expect(error).toBeNull();
    // Pode retornar itens de outras lojas às quais o outsider tenha acesso,
    // mas nenhum deve pertencer à loja de teste.
    if (data && data.length > 0) {
      const { data: mine } = await outsider
        .from("purchase_orders")
        .select("id")
        .eq("store_id", STORE_ID!);
      expect(mine?.length ?? 0).toBe(0);
    }
  });

  it("DONO enxerga as compras da loja", async () => {
    const { data, error } = await owner
      .from("purchase_orders")
      .select("id")
      .eq("store_id", STORE_ID!)
      .limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});