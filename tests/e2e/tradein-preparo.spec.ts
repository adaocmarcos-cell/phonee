/**
 * E2E — Diálogo de prévia de preparo do trade-in
 *
 * Valida:
 *   1) A prévia BLOQUEIA a confirmação quando há peças com estoque insuficiente
 *      (aviso "Estoque insuficiente" visível e botão "Confirmar" desabilitado).
 *   2) Ao ajustar para dentro do estoque disponível, a confirmação libera,
 *      salva com sucesso, o badge de status vira "Em estoque" e a linha do
 *      tempo passa a exibir a transição para "Em estoque".
 *
 * Requer credenciais e um trade-in de teste em "aguardando_preparo":
 *   PW_TEST_EMAIL / PW_TEST_PASSWORD
 *   PW_TRADEIN_AWAITING_ID  — id do trade_in
 *   PW_TRADEIN_PART_NAME    — nome de uma peça cadastrada em parts_inventory
 *                             com estoque >= 1 e < 999.
 *
 * Sem env, o teste é pulado para não quebrar CI.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.PW_TEST_EMAIL;
const PASSWORD = process.env.PW_TEST_PASSWORD;
const TRADEIN_ID = process.env.PW_TRADEIN_AWAITING_ID;
const PART_NAME = process.env.PW_TRADEIN_PART_NAME;
const hasCreds = !!(EMAIL && PASSWORD && TRADEIN_ID && PART_NAME);

async function login(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(EMAIL!);
  await page.getByLabel(/senha/i).first().fill(PASSWORD!);
  await Promise.all([
    page.waitForURL(/\/painel/, { timeout: 15_000 }),
    page.getByRole("button", { name: /entrar/i }).click(),
  ]);
}

async function openRepairDialog(page: Page) {
  await page.goto(`/painel/troca/${TRADEIN_ID}/detalhes`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /registrar preparo/i }).click();
  await expect(page.getByText(/consumo de peças/i)).toBeVisible();
}

async function addPartRow(page: Page, name: string, qty: number) {
  await page.getByRole("button", { name: /adicionar peça/i }).click();
  // Abre o select mais recente
  const selects = page.locator('[role="combobox"]');
  await selects.last().click();
  await page.getByRole("option", { name: new RegExp(name, "i") }).first().click();
  // Preenche qty (último input numérico de quantidade)
  const qtyInputs = page.locator('input[inputmode="numeric"]');
  await qtyInputs.nth(-2).fill(String(qty));
}

test.describe("Trade-in — prévia de preparo", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasCreds, "Defina PW_TEST_EMAIL/PW_TEST_PASSWORD/PW_TRADEIN_AWAITING_ID/PW_TRADEIN_PART_NAME.");
    await login(page);
  });

  test("bloqueia confirmação quando peça está sem estoque", async ({ page }) => {
    await openRepairDialog(page);
    await addPartRow(page, PART_NAME!, 999); // qty acima do estoque disponível
    await page.getByRole("button", { name: /revisar e concluir/i }).click();

    // Prévia aparece com aviso de estoque insuficiente
    await expect(page.getByText(/estoque insuficiente/i)).toBeVisible();

    // Botão de confirmação está desabilitado
    const confirm = page.getByRole("button", { name: /confirmar e enviar ao estoque/i });
    await expect(confirm).toBeDisabled();
  });

  test("confirma preparo e status vira 'Em estoque' com evento na linha do tempo", async ({ page }) => {
    await openRepairDialog(page);
    await addPartRow(page, PART_NAME!, 1);
    await page.getByRole("button", { name: /revisar e concluir/i }).click();

    // Prévia limpa
    await expect(page.getByText(/estoque disponível/i)).toBeVisible();
    const confirm = page.getByRole("button", { name: /confirmar e enviar ao estoque/i });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Toast de sucesso
    await expect(page.getByText(/preparo concluído/i)).toBeVisible({ timeout: 10_000 });

    // Badge principal vira "Em estoque"
    await expect(page.getByText(/^Em estoque$/i).first()).toBeVisible();

    // Linha do tempo passa a exibir a transição
    await expect(page.getByText(/linha do tempo/i)).toBeVisible();
    await expect(page.getByText(/mudança de status/i).first()).toBeVisible();
  });
});