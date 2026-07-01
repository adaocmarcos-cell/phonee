import { supabase } from "@/integrations/supabase/client";

function buildSkuPrefix(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.map((w) => w[0]!.toUpperCase()).join("").slice(0, 6);
  return initials || "SKU";
}

export async function generateUniqueSku(storeId: string, name: string): Promise<string> {
  const prefix = buildSkuPrefix(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const digits = Math.floor(1000 + Math.random() * 9000).toString();
    const candidate = `${prefix}-${digits}`;
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("store_id", storeId)
      .eq("sku", candidate)
      .maybeSingle();
    if (error && (error as any).code !== "PGRST116") throw error;
    if (!data) return candidate;
  }
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}