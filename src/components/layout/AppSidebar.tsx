import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Boxes, BarChart3, Smartphone, ShoppingCart,
  Receipt, Users, Wrench, Bell, Tags, Settings, ShieldCheck, Wallet, Hammer,
  ArrowRightLeft, UserCog, KeyRound, FileSearch, CreditCard, Package, ScrollText, Lock, LifeBuoy, Inbox,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { canManageUsers, isAdminMaster } from "@/lib/roles";
import logoAsset from "@/assets/mobileplus-logo-sidebar.png.asset.json";

type Item = { title: string; url: string; icon: any; end?: boolean; children?: Item[]; badgeKey?: "alerts" };

const main: Item[] = [
  { title: "Curva ABC", url: "/app/curva-abc", icon: BarChart3 },
  { title: "Compra & Troca", url: "/app/trade-in", icon: ArrowRightLeft },
  { title: "Pedidos de compra", url: "/app/pedidos", icon: ShoppingCart },
  { title: "Logs", url: "/app/admin/logs", icon: FileSearch },
  { title: "Alertas", url: "/app/alertas", icon: Bell, badgeKey: "alerts" },
];

const ops: Item[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, end: true },
  { title: "Estoque", url: "/app/estoque", icon: Boxes },
  { title: "Clientes", url: "/app/clientes", icon: Users },
  { title: "Vendas", url: "/app/vendas", icon: Receipt },
  { title: "Custos & Despesas", url: "/app/despesas", icon: Wallet },
  { title: "Assistência & Serviços", url: "/app/os", icon: Wrench },
  { title: "Garantias", url: "/app/admin/garantias", icon: ShieldCheck },
];

const config = [
  { title: "Tabelas de Preço", url: "/app/tabelas-preco", icon: Tags },
  { title: "Configurações", url: "/app/admin/configuracoes", icon: Settings },
  { title: "Suporte", url: "/app/suporte", icon: LifeBuoy },
];

const adminItems: Item[] = [
  { title: "Usuários", url: "/app/admin/usuarios", icon: Users },
  { title: "Cargos e Funções", url: "/app/admin/cargos", icon: UserCog },
  { title: "Permissões", url: "/app/admin/permissoes", icon: KeyRound },
];

const adminMasterItems: Item[] = [
  { title: "Pagamentos Asaas", url: "/app/admin/pagamentos", icon: CreditCard },
  { title: "Planos", url: "/app/admin/planos", icon: Package },
  { title: "Assinaturas", url: "/app/admin/assinaturas", icon: Receipt },
  { title: "Logs de Pagamento", url: "/app/admin/logs-pagamento", icon: ScrollText },
  { title: "Chamados de Suporte", url: "/app/admin/suporte", icon: Inbox },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role, store } = useAuth();
  const showAdmin = canManageUsers(role as any);
  const showLogsOnly = isAdminMaster(role as any) || role === "dono";
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.id)
        .eq("is_read", false);
      if (!cancelled) setUnreadAlerts(count ?? 0);
    };
    fetchCount();
    const channel = supabase
      .channel(`sidebar-alerts-${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts", filter: `store_id=eq.${store.id}` }, fetchCount)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [store, pathname]);

  const renderGroup = (label: string, items: typeof main) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.end ? pathname === item.url : pathname.startsWith(item.url);
            const isDashboard = item.url === "/app";
            const childActive = item.children?.some((c) => pathname.startsWith(c.url));
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active && !childActive}
                  className="data-[active=true]:bg-[#00abfb] data-[active=true]:text-blue-900 data-[active=true]:font-semibold data-[active=true]:hover:bg-[#00abfb] data-[active=true]:hover:text-blue-900 hover:bg-sidebar-accent"
                >
                  <NavLink to={item.url} end={item.end}>
                    <span className="relative inline-flex">
                      <item.icon className="h-4 w-4" />
                      {item.badgeKey === "alerts" && unreadAlerts > 0 && (
                        <span
                          className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-[14px] text-center ring-2 ring-sidebar"
                          aria-label={`${unreadAlerts} alertas não lidos`}
                        >
                          {unreadAlerts > 9 ? "9+" : unreadAlerts}
                        </span>
                      )}
                    </span>
                    {!collapsed && (
                      <span className={`flex items-center gap-2 ${isDashboard && !active ? "text-[#00abfb] font-semibold" : ""}`}>
                        {item.title}
                        {item.badgeKey === "alerts" && unreadAlerts > 0 && (
                          <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {unreadAlerts > 99 ? "99+" : unreadAlerts}
                          </span>
                        )}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
                {!collapsed && item.children && (active || childActive) && (
                  <SidebarMenuSub>
                    {item.children.map((c) => {
                      const cActive = pathname === c.url || pathname.startsWith(c.url + "/");
                      return (
                        <SidebarMenuSubItem key={c.url}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={cActive}
                            className="data-[active=true]:bg-[#00abfb] data-[active=true]:text-blue-900 data-[active=true]:font-semibold"
                          >
                            <NavLink to={c.url}>
                              <c.icon className="h-3.5 w-3.5" />
                              <span>{c.title}</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
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
        <div className={`flex items-center justify-center px-2 ${collapsed ? "py-2" : "py-4"}`}>
          {collapsed ? (
            <span className="text-2xl font-bold leading-none text-[#00abfb]">+</span>
          ) : (
            <div className="flex items-baseline gap-0.5" aria-label="Mobile+">
              <span className="text-2xl font-bold tracking-tight text-white lowercase">mobile</span>
              <span className="text-2xl font-bold leading-none text-[#00abfb]">+</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Gestão", ops)}
        {renderGroup("Inteligência", main)}
        {renderGroup("Configuração", config)}
        {showAdmin && renderGroup(
          "Usuários e Permissões",
          adminItems.filter((it) => it.url !== "/app/admin/logs" || showLogsOnly)
        )}
        {isAdminMaster(role as any) && renderGroup("Financeiro / Admin Master", adminMasterItems)}
        <div className="mt-auto px-3 py-3 border-t border-sidebar-border">
          <div className={`flex items-center gap-2 text-[10px] text-muted-foreground/80 ${collapsed ? "justify-center" : ""}`}>
            <Lock className="h-3 w-3 text-success shrink-0" />
            {!collapsed && <span className="leading-tight">Dados protegidos com segurança e criptografia.</span>}
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}