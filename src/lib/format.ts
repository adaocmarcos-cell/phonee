export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export const num = (n: number) =>
  new Intl.NumberFormat("pt-BR").format(n || 0);

export const pct = (n: number, digits = 1) =>
  `${(n || 0).toFixed(digits).replace(".", ",")}%`;

export const daysAgo = (iso?: string | null) => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};