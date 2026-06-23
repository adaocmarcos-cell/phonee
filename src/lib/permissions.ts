import type { AppRole } from "./roles";

export type PermissionAction = "view" | "create" | "edit" | "delete";

export type PermissionModule = {
  key: string;
  label: string;
  description?: string;
  actions: PermissionAction[];
};

export const ACTION_LABEL: Record<PermissionAction, string> = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
};

export const PERMISSION_CATALOG: PermissionModule[] = [
  { key: "dashboard", label: "Visão geral", description: "Indicadores e gráficos da loja", actions: ["view"] },
  { key: "vendas", label: "Vendas", actions: ["view", "create", "edit", "delete"] },
  { key: "pedidos", label: "Pedidos", actions: ["view", "create", "edit", "delete"] },
  { key: "ordens_servico", label: "Ordens de serviço", actions: ["view", "create", "edit", "delete"] },
  { key: "estoque", label: "Estoque / Produtos", actions: ["view", "create", "edit", "delete"] },
  { key: "trade_in", label: "Compra & Troca", actions: ["view", "create", "edit", "delete"] },
  { key: "tabelas_preco", label: "Tabelas de preço", actions: ["view", "create", "edit", "delete"] },
  { key: "despesas", label: "Despesas", actions: ["view", "create", "edit", "delete"] },
  { key: "curva_abc", label: "Curva ABC", actions: ["view"] },
  { key: "alertas", label: "Alertas", actions: ["view", "edit"] },
  { key: "usuarios", label: "Usuários e cargos", description: "Cadastro e gestão de colaboradores", actions: ["view", "create", "edit", "delete"] },
  { key: "assinaturas", label: "Assinaturas e cobranças", actions: ["view", "edit"] },
  { key: "configuracoes", label: "Configurações da loja", actions: ["view", "edit"] },
];

export type PermissionMap = Record<string, Record<PermissionAction, boolean>>;

function buildMap(
  picker: (mod: PermissionModule, action: PermissionAction) => boolean,
): PermissionMap {
  const out: PermissionMap = {};
  PERMISSION_CATALOG.forEach((m) => {
    out[m.key] = {} as Record<PermissionAction, boolean>;
    m.actions.forEach((a) => (out[m.key][a] = picker(m, a)));
  });
  return out;
}

const all = () => buildMap(() => true);
const none = () => buildMap(() => false);

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<AppRole | "outro", PermissionMap> = {
  admin_master: all(),
  dono: all(),
  administrador: all(),
  gerente: buildMap((m) => !["usuarios", "assinaturas"].includes(m.key)),
  financeiro: buildMap((m, a) =>
    ["dashboard", "vendas", "pedidos", "despesas", "curva_abc", "assinaturas"].includes(m.key)
      ? a === "view" || a === "edit" || (m.key === "despesas" && (a === "create" || a === "delete"))
      : false,
  ),
  tecnico: buildMap((m, a) =>
    m.key === "ordens_servico" ? true : m.key === "estoque" ? a === "view" : m.key === "dashboard" && a === "view",
  ),
  vendedor: buildMap((m, a) => {
    if (["vendas", "pedidos", "trade_in"].includes(m.key)) return a === "view" || a === "create" || a === "edit";
    if (m.key === "estoque" || m.key === "tabelas_preco" || m.key === "dashboard") return a === "view";
    return false;
  }),
  estoquista: buildMap((m, a) => {
    if (m.key === "estoque" || m.key === "trade_in") return true;
    if (m.key === "tabelas_preco" || m.key === "dashboard") return a === "view";
    return false;
  }),
  atendimento: buildMap((m, a) =>
    ["vendas", "pedidos", "ordens_servico"].includes(m.key) ? a === "view" : m.key === "dashboard" && a === "view",
  ),
  outro: none(),
};

export function defaultsForRole(role: AppRole | "outro"): PermissionMap {
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[role] ?? none()));
}

export function countAllowed(perms: PermissionMap): number {
  let n = 0;
  Object.values(perms).forEach((m) => Object.values(m).forEach((v) => v && n++));
  return n;
}

export function countTotal(): number {
  return PERMISSION_CATALOG.reduce((acc, m) => acc + m.actions.length, 0);
}