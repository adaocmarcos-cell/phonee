/**
 * E2E: valida que as políticas RLS de vendas/compras batem com o esperado.
 *
 * Pré-requisitos (env):
 *   E2E_BASE_URL           URL do preview (ex.: https://xxx.lovable.app ou http://localhost:8080)
 *   E2E_SUPABASE_URL       URL do projeto Supabase
 *   E2E_ANON_KEY           Chave anon
 *   E2E_SEED_TOKEN         Valor do secret TEST_SEED_TOKEN configurado na edge function
 *
 * Suite é ignorada quando qualquer um faltar (mantém CI verde por padrão).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL;
const SUPABASE_URL = process.env.E2E_SUPABASE_URL;
const ANON = process.env.E2E_ANON_KEY;
const TOKEN = process.env.E2E_SEED_TOKEN;
const ready = !!(BASE && SUPABASE_URL && ANON && TOKEN);

type Seed = {
  password: string;
  users: { key: string; email: string; role: string }[];
  store_a_id: string; store_b_id: string;
  sale_id: string; purchase_order_id: string;
};

async function callSeed(action: "seed" | "cleanup") {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/test-seed-rls?action=${action}`, {
    method: "POST",
    headers: {
      apikey: ANON!, Authorization: `Bearer ${ANON}`,
      "x-test-seed-token": TOKEN!, "content-type": "application/json",
    },
  });
  return res.json();
}

test.describe(ready ? "RLS de vendas e compras" : "RLS de vendas e compras (skipped)", () => {
  test.skip(!ready, "Defina E2E_BASE_URL, E2E_SUPABASE_URL, E2E_ANON_KEY, E2E_SEED_TOKEN.");

  let seed: Seed;

  test.beforeAll(async () => {
    const r = await callSeed("seed");
    if (!r.ok) throw new Error(`Seed failed: ${JSON.stringify(r)}`);
    seed = r as Seed;
  });

  test.afterAll(async () => {
    await callSeed("cleanup").catch(() => {});
  });

  const login = async (page: any, email: string) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/e-?mail/i).fill(email);
    await page.getByLabel(/senha/i).fill(seed.password);
    await page.getByRole("button", { name: /entrar|login/i }).click();
    await page.waitForURL(/\/app|\/painel/, { timeout: 15000 });
  };

  for (const key of ["owner_a", "manager_a", "seller_a"] as const) {
    test(`${key}: vê a venda seed da loja A`, async ({ page }) => {
      const u = seed.users.find((x) => x.key === key)!;
      await login(page, u.email);
      await page.goto(`${BASE}/app/vendas`);
      await expect(page.getByText(/e2e_rls_store_A|R\$\s*100/i).first())
        .toBeVisible({ timeout: 10000 });
    });
  }

  test("outsider (loja B) NÃO vê venda da loja A", async ({ page }) => {
    const u = seed.users.find((x) => x.key === "owner_b")!;
    await login(page, u.email);
    await page.goto(`${BASE}/app/vendas`);
    // A tela pode carregar mas a venda de A não pode aparecer
    await expect(page.getByText(seed.sale_id.slice(0, 8), { exact: false })).toHaveCount(0);
  });

  test("outsider (loja B) NÃO vê compra da loja A", async ({ page }) => {
    const u = seed.users.find((x) => x.key === "owner_b")!;
    await login(page, u.email);
    await page.goto(`${BASE}/app/compras`);
    await expect(page.getByText(seed.purchase_order_id.slice(0, 8), { exact: false })).toHaveCount(0);
  });
});
