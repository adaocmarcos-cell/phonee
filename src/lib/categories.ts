export type ProductCategory = {
  value: string;
  label: string;
};

// Categorias PRINCIPAIS — devem corresponder ao enum `product_category` no banco.
// Valores válidos: acessorio | peca | aparelho_novo | aparelho_seminovo
export const MAIN_CATEGORIES: ProductCategory[] = [
  { value: "acessorio", label: "Acessório" },
  { value: "peca", label: "Peça" },
  { value: "aparelho_novo", label: "Aparelho novo" },
  { value: "aparelho_seminovo", label: "Aparelho seminovo" },
];

// Subcategorias sugeridas por categoria principal (opcionais).
export const SUBCATEGORIES_BY_MAIN: Record<string, ProductCategory[]> = {
  acessorio: [
    { value: "fones", label: "Fones de ouvido" },
    { value: "caixas_som", label: "Caixas de som" },
    { value: "carregadores", label: "Carregadores" },
    { value: "cabos", label: "Cabos" },
    { value: "capas", label: "Capas" },
    { value: "peliculas", label: "Películas" },
    { value: "powerbanks", label: "Powerbanks" },
    { value: "smartwatches", label: "Smartwatches" },
    { value: "memoria", label: "Memória" },
    { value: "outros", label: "Outros" },
  ],
  peca: [
    { value: "tela", label: "Tela / Display" },
    { value: "bateria", label: "Bateria" },
    { value: "conector_carga", label: "Conector de carga" },
    { value: "alto_falante", label: "Alto-falante" },
    { value: "camera", label: "Câmera" },
    { value: "tampa", label: "Tampa traseira" },
    { value: "placa", label: "Placa / Componente" },
    { value: "outros", label: "Outros" },
  ],
  aparelho_novo: [
    { value: "smartphones", label: "Smartphones" },
    { value: "smartwatches", label: "Smartwatches" },
    { value: "tablets", label: "Tablets" },
    { value: "outros", label: "Outros" },
  ],
  aparelho_seminovo: [
    { value: "smartphones", label: "Smartphones" },
    { value: "smartwatches", label: "Smartwatches" },
    { value: "tablets", label: "Tablets" },
    { value: "outros", label: "Outros" },
  ],
};

// Mantido para compatibilidade com telas existentes (Estoque, TabelasPreco)
// que usam o conjunto antigo como rótulos de exibição.
export const DEFAULT_CATEGORIES: ProductCategory[] = [
  ...MAIN_CATEGORIES,
  { value: "smartphones", label: "Smartphones" },
  { value: "smartwatches", label: "Smartwatches" },
  { value: "powerbanks", label: "Powerbanks" },
  { value: "fones", label: "Fones de Ouvido" },
  { value: "caixas_som", label: "Caixas de som" },
  { value: "memoria", label: "Memória" },
  { value: "acessorios", label: "Acessórios" },
  { value: "carregadores", label: "Carregadores" },
  { value: "cabos", label: "Cabos" },
  { value: "capas", label: "Capas" },
  { value: "peliculas", label: "Películas" },
  { value: "outros", label: "Outros" },
];

const CUSTOM_KEY = "phonee.customCategories";
const LEGACY_CUSTOM_KEY = "mobileplus.customCategories";

export function getCustomCategories(): ProductCategory[] {
  if (typeof window === "undefined") return [];
  try {
    let raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_CUSTOM_KEY);
      if (legacy) {
        raw = legacy;
        try { localStorage.setItem(CUSTOM_KEY, legacy); localStorage.removeItem(LEGACY_CUSTOM_KEY); } catch {}
      }
    }
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && x.value && x.label) : [];
  } catch {
    return [];
  }
}

export function addCustomCategory(label: string): ProductCategory {
  const value = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || `cat_${Date.now()}`;
  const all = getCustomCategories();
  if (!all.find((c) => c.value === value) && !DEFAULT_CATEGORIES.find((c) => c.value === value)) {
    all.push({ value, label: label.trim() });
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(all));
  }
  return { value, label: label.trim() };
}

export function getAllCategories(): ProductCategory[] {
  return [...DEFAULT_CATEGORIES, ...getCustomCategories()];
}

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const all = getAllCategories();
  return all.find((c) => c.value === value)?.label ?? value;
}