// Modelo de item unificado do estoque (ERP de nicho: smartphones, assistência, acessórios).
// O cadastro é único; o que muda é o conjunto de campos exigidos por tipo.

export type ItemKind = "aparelho" | "acessorio" | "peca" | "ferramenta";

export const ITEM_KINDS: { value: ItemKind; label: string; hint: string }[] = [
  { value: "aparelho",   label: "Aparelho",   hint: "Celular/tablet com IMEI. Uma unidade por registro." },
  { value: "acessorio",  label: "Acessório",  hint: "Capa, película, carregador. Quantidade livre." },
  { value: "peca",       label: "Peça",       hint: "Tela, bateria, flex. Consumida em O.S. ou vendida." },
  { value: "ferramenta", label: "Ferramenta", hint: "Uso interno. Não entra no valor do estoque nem na venda." },
];

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  aparelho: "Aparelho",
  acessorio: "Acessório",
  peca: "Peça",
  ferramenta: "Ferramenta",
};

/** Tipos que compõem valor de estoque, alerta de mínimo e busca de venda. */
export const SELLABLE_KINDS: ItemKind[] = ["aparelho", "acessorio", "peca"];

export function kindFromCategory(category?: string | null): ItemKind {
  switch (category) {
    case "aparelho_novo":
    case "aparelho_seminovo":
      return "aparelho";
    case "peca":
      return "peca";
    default:
      return "acessorio";
  }
}

/** Categoria padrão sugerida quando o usuário escolhe o tipo. */
export function defaultCategoryForKind(kind: ItemKind, condition?: string): string {
  switch (kind) {
    case "aparelho":
      return condition && condition !== "novo" ? "aparelho_seminovo" : "aparelho_novo";
    case "peca":
    case "ferramenta":
      return "peca";
    default:
      return "acessorio";
  }
}

export const isDevice = (k: ItemKind) => k === "aparelho";
export const isTool = (k: ItemKind) => k === "ferramenta";
/** Peça e acessório têm quantidade livre e alerta de estoque mínimo. */
export const hasFreeQuantity = (k: ItemKind) => k === "acessorio" || k === "peca";

/** Valida IMEI: 15 dígitos + algoritmo de Luhn. */
export function isValidImei(raw: string): boolean {
  const s = (raw || "").replace(/\D/g, "");
  if (s.length !== 15) return false;
  let total = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(s[i]);
    // posições pares (1-indexadas) são dobradas
    if ((i + 1) % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

export function imeiError(raw: string): string | null {
  const s = (raw || "").replace(/\D/g, "");
  if (s.length === 0) return "Informe o IMEI do aparelho.";
  if (s.length !== 15) return `IMEI deve ter 15 dígitos (você digitou ${s.length}).`;
  if (!isValidImei(s)) return "IMEI inválido: não passa na validação do dígito verificador (Luhn).";
  return null;
}
