import { MAIN_CATEGORIES, SUBCATEGORIES_BY_MAIN } from "./categories";

export const NONE_SUBCATEGORY = "__none__";

export const VALID_MAIN_CATEGORIES = MAIN_CATEGORIES.map((c) => c.value);

export type ProductCategoryInput = {
  category: string;
  subcategory?: string;
};

export type ProductCategoryValidation = {
  ok: boolean;
  category: string;
  subcategory: string | null;
  message?: string;
};

/**
 * Valida os campos de categoria/subcategoria antes do envio ao banco.
 * - `category` é obrigatório e precisa pertencer ao enum `product_category`.
 * - `subcategory` é opcional: o sentinel "__none__" ou string vazia => null.
 */
export function validateProductCategory(input: ProductCategoryInput): ProductCategoryValidation {
  const category = (input.category ?? "").trim();
  if (!category) {
    return { ok: false, category: "", subcategory: null, message: "Selecione uma categoria principal." };
  }
  if (!VALID_MAIN_CATEGORIES.includes(category)) {
    return {
      ok: false,
      category,
      subcategory: null,
      message: `Categoria inválida ("${category}"). Selecione uma das opções da lista.`,
    };
  }

  const raw = (input.subcategory ?? "").trim();
  if (!raw || raw === NONE_SUBCATEGORY) {
    return { ok: true, category, subcategory: null };
  }

  const allowed = SUBCATEGORIES_BY_MAIN[category]?.map((s) => s.value) ?? [];
  if (allowed.length > 0 && !allowed.includes(raw)) {
    // Subcategoria não pertence à categoria atual — trate como ausente.
    return { ok: true, category, subcategory: null };
  }
  return { ok: true, category, subcategory: raw };
}

/**
 * Converte erros do Postgres relacionados ao enum `product_category`
 * em uma mensagem amigável para o usuário final.
 * Retorna `null` se não for um erro reconhecido.
 */
export function friendlyCategoryError(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error?.message) return null;
  const msg = error.message.toLowerCase();
  if (msg.includes("invalid input value for enum product_category")) {
    const match = error.message.match(/"([^"]+)"/);
    const value = match?.[1];
    return value
      ? `Categoria "${value}" não é válida. Selecione uma das opções da lista (Acessório, Peça, Aparelho novo ou Aparelho seminovo).`
      : "Categoria inválida. Selecione uma das opções da lista.";
  }
  if (error.code === "22P02" && msg.includes("product_category")) {
    return "Categoria inválida. Selecione uma das opções da lista.";
  }
  return null;
}

/**
 * Lista de subcategorias contextual para a categoria principal escolhida.
 * Retorna lista vazia quando nenhuma categoria foi selecionada.
 */
export function subcategoriesFor(category: string) {
  if (!category) return [];
  return SUBCATEGORIES_BY_MAIN[category] ?? [{ value: "outros", label: "Outros" }];
}

/**
 * Converte um valor de subcategoria vindo do banco em um valor de campo de formulário.
 * Devolve string vazia quando não há valor, para que o `<Select>` mostre
 * "— Sem subcategoria —" via sentinel.
 */
export function prefillSubcategoryFromDb(value: string | null | undefined): string {
  if (value == null) return "";
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? "" : trimmed;
}

/**
 * Reage à troca de categoria principal: se a subcategoria atual não pertencer
 * à nova categoria, ela é limpa. Caso contrário, mantém a seleção.
 */
export function reconcileSubcategoryOnCategoryChange(
  newCategory: string,
  currentSubcategory: string,
): string {
  if (!newCategory) return "";
  if (!currentSubcategory) return "";
  const allowed = subcategoriesFor(newCategory).map((s) => s.value);
  return allowed.includes(currentSubcategory) ? currentSubcategory : "";
}