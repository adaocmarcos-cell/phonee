/**
 * Configuração central de marketing / tráfego pago.
 *
 * IMPORTANTE: o Meta Pixel do projeto NÃO é configurado aqui. Ele já
 * é carregado pelo componente <MetaPixel /> (src/components/MetaPixel.tsx)
 * a partir do valor salvo em marketing_settings (RPC get_meta_pixel_id).
 * Todos os eventos fbq('track', ...) usam essa mesma instância.
 */

/**
 * Enquanto o WhatsApp Business não estiver ativo, mantenha em `false`.
 * Quando ativar, mude para `true` — todos os botões de WhatsApp voltam
 * a aparecer no site sem precisar mexer em componente nenhum.
 */
export const SHOW_WHATSAPP = false;

/** Número de WhatsApp (formato internacional, apenas dígitos). */
export const WHATSAPP_NUMBER = "5531900000000";

/** Mensagem padrão enviada ao clicar em qualquer CTA de WhatsApp. */
export const WHATSAPP_DEFAULT_MESSAGE =
  "Olá! Vi o anúncio do Phonee e quero testar na minha loja";

/** Monta a URL wa.me com mensagem pré-preenchida, anexando UTM discretamente. */
export function buildWhatsappUrl(
  message: string = WHATSAPP_DEFAULT_MESSAGE,
  utmCampaign?: string | null,
): string {
  const suffix = utmCampaign ? ` [origem: ${utmCampaign}]` : "";
  const text = encodeURIComponent(`${message}${suffix}`);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}