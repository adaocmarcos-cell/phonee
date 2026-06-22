import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export type RoleDef = {
  value: AppRole;
  label: string;
  description: string;
  hierarchy: number; // menor = maior poder
};

export const ROLE_CATALOG: RoleDef[] = [
  { value: "admin_master", label: "Admin Master", description: "Controle total da plataforma e dos logs.", hierarchy: 0 },
  { value: "dono", label: "Dono / Proprietário", description: "Dono da loja com gestão total do negócio.", hierarchy: 1 },
  { value: "administrador", label: "Administrador", description: "Gestão operacional completa.", hierarchy: 2 },
  { value: "gerente", label: "Gerente", description: "Gestão dos setores e equipes.", hierarchy: 3 },
  { value: "financeiro", label: "Financeiro", description: "Contas a pagar/receber e fluxo de caixa.", hierarchy: 4 },
  { value: "tecnico", label: "Técnico", description: "Assistência técnica e ordens de serviço.", hierarchy: 4 },
  { value: "vendedor", label: "Vendedor", description: "Atendimento comercial e registro de vendas.", hierarchy: 5 },
  { value: "estoquista", label: "Estoque", description: "Gestão de estoque e produtos.", hierarchy: 5 },
  { value: "atendimento", label: "Atendimento", description: "Clientes, pós-venda e suporte.", hierarchy: 6 },
];

const MAP = new Map<AppRole, RoleDef>(ROLE_CATALOG.map((r) => [r.value, r]));

export function roleLabel(role: AppRole | string | null | undefined): string {
  if (!role) return "—";
  return MAP.get(role as AppRole)?.label ?? role;
}

export function isAdminLevel(role: AppRole | null | undefined): boolean {
  return role === "admin_master" || role === "dono" || role === "administrador";
}

export function canManageUsers(role: AppRole | null | undefined): boolean {
  return isAdminLevel(role);
}

export function isAdminMaster(role: AppRole | null | undefined): boolean {
  return role === "admin_master";
}