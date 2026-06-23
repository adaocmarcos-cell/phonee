import { supabase } from "@/integrations/supabase/client";

export type WarrantyOption = { days: number; label: string };

export type WarrantySettings = {
  id?: string;
  store_id: string;
  notice_text: string;
  message_template: string;
  default_enabled: boolean;
  default_days: number;
  options: WarrantyOption[];
};

export const DEFAULT_WARRANTY: Omit<WarrantySettings, "store_id"> = {
  notice_text:
    "Garantia legal de 90 dias contra defeitos de fabricação, conforme o CDC.",
  message_template:
    "A garantia não cobre danos por mau uso, quedas, exposição a líquidos, violação por terceiros ou desgaste natural. Para acionamento, é obrigatória a apresentação deste comprovante.",
  default_enabled: true,
  default_days: 90,
  options: [
    { days: 30, label: "30 dias" },
    { days: 90, label: "90 dias (legal)" },
    { days: 180, label: "6 meses" },
    { days: 365, label: "1 ano" },
  ],
};

export async function loadWarrantySettings(storeId: string): Promise<WarrantySettings> {
  const { data } = await (supabase as any)
    .from("warranty_settings")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (data) return data as WarrantySettings;
  return { store_id: storeId, ...DEFAULT_WARRANTY };
}

export async function saveWarrantySettings(s: WarrantySettings) {
  const payload = {
    store_id: s.store_id,
    notice_text: s.notice_text,
    message_template: s.message_template,
    default_enabled: s.default_enabled,
    default_days: s.default_days,
    options: s.options,
  };
  return (supabase as any)
    .from("warranty_settings")
    .upsert(payload, { onConflict: "store_id" })
    .select()
    .single();
}