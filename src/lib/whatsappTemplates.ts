// Utilitários de templates de WhatsApp por loja.
// Não integra API — apenas monta wa.me com texto pré-preenchido.

export type WhatsappEventKey =
  | "os_criada"
  | "orcamento_pronto"
  | "orcamento_aprovado"
  | "aparelho_pronto"
  | "os_entregue_garantia"
  | "venda_concluida"
  | "cobranca_pendente"
  | "cobranca_vencida";

export const WHATSAPP_EVENTS: {
  key: WhatsappEventKey;
  label: string;
  context: "os" | "venda";
  hint: string;
}[] = [
  { key: "os_criada",             label: "OS criada",                    context: "os",    hint: "Confirmação de entrada do aparelho." },
  { key: "orcamento_pronto",      label: "Orçamento pronto",             context: "os",    hint: "Envio do orçamento para aprovação." },
  { key: "orcamento_aprovado",    label: "Orçamento aprovado",           context: "os",    hint: "Aviso de início do serviço." },
  { key: "aparelho_pronto",       label: "Aparelho pronto para retirada", context: "os",   hint: "Aparelho concluído, cliente pode retirar." },
  { key: "os_entregue_garantia",  label: "Entrega e garantia",           context: "os",    hint: "Agradecimento + garantia após entrega." },
  { key: "venda_concluida",       label: "Venda concluída",              context: "venda", hint: "Agradecimento após finalizar a venda." },
  { key: "cobranca_pendente",     label: "Cobrança pendente",            context: "venda", hint: "Lembrete de valor em aberto." },
  { key: "cobranca_vencida",      label: "Cobrança de parcela vencida",  context: "venda", hint: "Cobrança educada para parcelas atrasadas." },
];

export const WHATSAPP_VARIABLES = [
  "cliente",
  "loja",
  "os_numero",
  "aparelho",
  "valor",
  "prazo",
  "garantia_ate",
  "link_acompanhamento",
  "vencimento",
  "dias_atraso",
  "parcela",
] as const;

export type WhatsappVars = Partial<Record<(typeof WHATSAPP_VARIABLES)[number], string | number | null | undefined>>;

/** Substitui {chave} pelo valor. Chaves sem valor viram "—". */
export function renderWhatsappTemplate(body: string, vars: WhatsappVars): string {
  return body.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = (vars as any)[k];
    if (v === undefined || v === null || v === "") return "—";
    return String(v);
  });
}

/**
 * Normaliza um telefone BR para o formato aceito pelo wa.me: somente dígitos,
 * com DDI 55 na frente. Ignora números vazios. Se já vier com 55, respeita.
 */
export function normalizeWhatsappPhone(input: string | null | undefined): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return "55" + digits;
}

export function buildWaMeUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** Sugere o(s) evento(s) mais relevantes para o status atual da OS. */
export function suggestedOsEvents(status: string, budgetStatus?: string): WhatsappEventKey[] {
  switch (status) {
    case "recebido":
    case "em_analise":
      return ["os_criada"];
    case "aguardando_orcamento":
      return ["os_criada", "orcamento_pronto"];
    case "aguardando_aprovacao":
      return ["orcamento_pronto"];
    case "aguardando_peca":
    case "em_reparo":
    case "em_testes":
      return budgetStatus === "aprovado" ? ["orcamento_aprovado"] : ["orcamento_aprovado", "orcamento_pronto"];
    case "pronto_retirada":
      return ["aparelho_pronto"];
    case "entregue":
      return ["os_entregue_garantia"];
    default:
      return ["os_criada"];
  }
}

/** Status da OS em que o botão de envio deve ficar destacado (badge/pulso). */
export function isHighlightOsStatus(status: string): boolean {
  return status === "pronto_retirada";
}