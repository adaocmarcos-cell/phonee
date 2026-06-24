export type ProductCategory = {
  value: string;
  label: string;
};

export const DEFAULT_CATEGORIES: ProductCategory[] = [
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