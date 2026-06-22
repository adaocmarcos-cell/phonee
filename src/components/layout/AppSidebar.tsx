import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Boxes, BarChart3, Smartphone, ShoppingCart,
  Receipt, Users, Wrench, Bell, Globe, Settings, ShieldCheck, Wallet,
  ArrowRightLeft,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import logoIcon from "@/assets/mobileplus-icon.png";

type Item = { title: string; url: string; icon: any; end?: boolean };

const main: Item[] = [
  { title: "Estoque", url: "/app/estoque", icon: Boxes },
  { title: "Curva ABC", url: "/app/curva-abc", icon: BarChart3 },
  { title: "Compra & Troca", url: "/app/trade-in", icon: ArrowRightLeft },
  { title: "Pedidos de compra", url: "/app/pedidos", icon: ShoppingCart },
];

const ops: Item[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, end: true },
  { title: "Vendas", url: "/app/vendas", icon: Receipt },
  { title: "Custos & Despesas", url: "/app/despesas", icon: Wallet },
  { title: "Clientes", url: "/app/clientes", icon: Users },
  { title: "Ordens de Serviço", url: "/app/os", icon: Wrench },
  { title: "Alertas", url: "/app/alertas", icon: Bell },
];

const config = [
  { title: "Catálogo público", url: "/app/catalogo-config", icon: Globe },
  { title: "Usuários", url: "/app/admin/usuarios", icon: ShieldCheck },
  { title: "Configurações", url: "/app/admin/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();

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
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-2">
          <img src={logoIcon} alt="" width={28} height={28} className="h-7 w-7" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold tracking-tight">Mobile+</span>
              <span className="text-[10px] text-muted-foreground font-mono">v1.0</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Operação", ops)}
        {renderGroup("Inteligência", main)}
        {renderGroup("Configuração", config)}
      </SidebarContent>
    </Sidebar>
  );
}