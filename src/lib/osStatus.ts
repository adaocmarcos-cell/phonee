export const OS_STATUS_LABEL: Record<string, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  aguardando_orcamento: "Aguard. orçamento",
  aguardando_aprovacao: "Aguard. aprovação",
  aguardando_peca: "Aguard. peça",
  em_reparo: "Em reparo",
  em_testes: "Em testes",
  pronto_retirada: "Pronto p/ retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const OS_STATUS_COLOR: Record<string, string> = {
  recebido: "bg-slate-100 text-slate-700 border-slate-300",
  em_analise: "bg-blue-50 text-blue-700 border-blue-200",
  aguardando_orcamento: "bg-amber-50 text-amber-700 border-amber-200",
  aguardando_aprovacao: "bg-amber-50 text-amber-700 border-amber-200",
  aguardando_peca: "bg-orange-50 text-orange-700 border-orange-200",
  em_reparo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  em_testes: "bg-purple-50 text-purple-700 border-purple-200",
  pronto_retirada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  entregue: "bg-green-50 text-green-700 border-green-200",
  cancelado: "bg-rose-50 text-rose-700 border-rose-200",
};

export const OS_TERMINAL_STATUSES = new Set(["entregue", "cancelado"]);

export const OS_STATUS_ORDER: string[] = [
  "recebido",
  "em_analise",
  "aguardando_orcamento",
  "aguardando_aprovacao",
  "aguardando_peca",
  "em_reparo",
  "em_testes",
  "pronto_retirada",
  "entregue",
  "cancelado",
];

export const fmtOS = (n?: number | null) => `OS #${String(n ?? 0).padStart(4, "0")}`;