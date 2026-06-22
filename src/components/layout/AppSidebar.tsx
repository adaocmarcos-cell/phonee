import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Boxes, BarChart3, Smartphone, ShoppingCart,
  Receipt, Users, Wrench, Bell, Tags, Settings, ShieldCheck, Wallet,
  ArrowRightLeft, UserCog, KeyRound, FileSearch,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { canManageUsers, isAdminMaster } from "@/lib/roles";
import logoAsset from "@/assets/mobileplus-logo.png.asset.json";

type Item = { title: string; url: string; icon: any; end?: boolean };

const main: Item[] = [
  { title: "Curva ABC", url: "/app/curva-abc", icon: BarChart3 },
  { title: "Compra & Troca", url: "/app/trade-in", icon: ArrowRightLeft },
  { title: "Pedidos de compra", url: "/app/pedidos", icon: ShoppingCart },
];

const ops: Item[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, end: true },
  { title: "Estoque", url: "/app/estoque", icon: Boxes },
  { title: "Vendas", url: "/app/vendas", icon: Receipt },
  { title: "Custos & Despesas", url: "/app/despesas", icon: Wallet },
  { title: "Clientes", url: "/app/clientes", icon: Users },
  { title: "Ordens de Serviço", url: "/app/os", icon: Wrench },
  { title: "Alertas", url: "/app/alertas", icon: Bell },
];

const config = [
  { title: "Tabelas de Preço", url: "/app/tabelas-preco", icon: Tags },
  { title: "Configurações", url: "/app/admin/configuracoes", icon: Settings },
];

const adminItems: Item[] = [
  { title: "Usuários", url: "/app/admin/usuarios", icon: Users },
  { title: "Cargos e Funções", url: "/app/admin/cargos", icon: UserCog },
  { title: "Permissões", url: "/app/admin/permissoes", icon: KeyRound },
  { title: "Logs e Auditoria", url: "/app/admin/logs", icon: FileSearch },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role } = useAuth();
  const showAdmin = canManageUsers(role as any);
  const showLogsOnly = isAdminMaster(role as any) || role === "dono";

  const renderGroup = (label: string, items: typeof main) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.end ? pathname === item.url : pathname.startsWith(item.url);
            const isDashboard = item.url === "/app";
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="data-[active=true]:bg-[#00abfb] data-[active=true]:text-blue-900 data-[active=true]:font-semibold data-[active=true]:hover:bg-[#00abfb] data-[active=true]:hover:text-blue-900 hover:bg-sidebar-accent"
                >
                  <NavLink to={item.url} end={item.end}>
                    <item.icon className="h-4 w-4" />
                    {!collapsed && (
                      <span className={isDashboard && !active ? "text-[#00abfb] font-semibold" : ""}>
                        {item.title}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border bg-white">
        <div className={`flex items-center justify-center px-2 ${collapsed ? "py-3" : "py-6"}`}>
          <img
            src={logoAsset.url}
            alt="Mobile+"
            className={collapsed ? "h-10 w-auto" : "h-28 w-auto"}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Operação", ops)}
        {renderGroup("Inteligência", main)}
        {renderGroup("Configuração", config)}
        {showAdmin && renderGroup(
          "Usuários e Permissões",
          adminItems.filter((it) => it.url !== "/app/admin/logs" || showLogsOnly)
        )}
      </SidebarContent>
    </Sidebar>
  );
}