import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Boxes, BarChart3, Smartphone, ShoppingCart,
  Receipt, Users, Wrench, Bell, Tags, Settings, ShieldCheck, Wallet, Hammer,
  ArrowRightLeft, KeyRound, FileSearch, CreditCard, Package, ScrollText, Lock, LifeBuoy, Inbox,
  DollarSign, Building2, Gift, AlertTriangle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { canManageUsers, isAdminMaster } from "@/lib/roles";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";
import { StoreSwitcher } from "./StoreSwitcher";

type Item = { title: string; url: string; icon: any; end?: boolean; children?: Item[]; badgeKey?: "alerts" | "notifications" };

const main: Item[] = [
  { title: "Curva ABC", url: "/painel/curva-abc", icon: BarChart3 },
  { title: "Compra & Troca", url: "/painel/troca", icon: ArrowRightLeft },
  { title: "Pedidos de compra", url: "/painel/pedidos", icon: ShoppingCart },
  { title: "Logs", url: "/painel/logs", icon: FileSearch },
  { title: "Alertas", url: "/painel/alertas", icon: AlertTriangle, badgeKey: "alerts" },
  { title: "Notificações", url: "/painel/configuracoes?tab=notificacoes", icon: Bell, badgeKey: "notifications" },
];

const ops: Item[] = [
  { title: "Dashboard", url: "/painel", icon: LayoutDashboard, end: true },
  { title: "Vendas", url: "/painel/vendas", icon: Receipt },
  { title: "Estoque", url: "/painel/estoque", icon: Boxes },
  { title: "Clientes", url: "/painel/clientes", icon: Users },
  { title: "Financeiro", url: "/painel/financeiro", icon: DollarSign },
  { title: "Assistência & Serviços", url: "/painel/ordens", icon: Wrench },
  { title: "Tabelas de Preço", url: "/painel/tabelas", icon: Tags },
  { title: "Garantias", url: "/painel/garantias", icon: ShieldCheck },
];

const config = [
  { title: "Configurações", url: "/painel/configuracoes", icon: Settings },
  { title: "Minhas Lojas", url: "/painel/lojas", icon: Building2 },
  { title: "Usuários", url: "/painel/usuarios", icon: Users },
  { title: "Suporte", url: "/painel/suporte", icon: LifeBuoy },
];

const adminMasterItems: Item[] = [
  { title: "Pagamentos Asaas", url: "/painel/pagamentos", icon: CreditCard },
  { title: "Planos", url: "/painel/planos", icon: Package },
  { title: "Assinaturas", url: "/painel/assinaturas", icon: Receipt },
  { title: "Logs de Pagamento", url: "/painel/logs-pagamento", icon: ScrollText },
  { title: "Chamados de Suporte", url: "/painel/suporte-admin", icon: Inbox },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { role, store } = useAuth();
  const showAdmin = canManageUsers(role as any);
  const showLogsOnly = isAdminMaster(role as any) || role === "dono";
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [hasNewNotification, setHasNewNotification] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("phonee:new_notification") === "1";
  });

  useEffect(() => {
    const sync = () => setHasNewNotification(localStorage.getItem("phonee:new_notification") === "1");
    window.addEventListener("storage", sync);
    window.addEventListener("phonee:new_notification", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("phonee:new_notification", sync);
    };
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/painel/configuracoes") && hasNewNotification) {
      localStorage.removeItem("phonee:new_notification");
      setHasNewNotification(false);
    }
  }, [pathname, hasNewNotification]);

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

  const renderGroup = (label: string, items: typeof main, opts?: { hideLabel?: boolean }) => (
    <SidebarGroup>
      {!collapsed && !opts?.hideLabel && label && (
        <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">{label}</SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.end ? pathname === item.url : pathname.startsWith(item.url);
            const isDashboard = item.url === "/painel";
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
                      {item.badgeKey === "notifications" && hasNewNotification && (
                        <span
                          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-sidebar"
                          aria-label="Nova notificação"
                        />
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
        <div
          className={`flex items-center justify-center px-2 ${
            collapsed
              ? "py-1"
              : pathname.startsWith("/painel/vendas")
              ? "py-[0.28125rem]"
              : "py-1.5"
          }`}
        >
          {collapsed ? (
            <span className="text-2xl font-bold leading-none text-[#00abfb]">+</span>
          ) : (
            <img
              src={logoAsset.url}
              alt="Phonee"
              className="h-[113px] w-auto object-contain bg-transparent border-0 shadow-none block"
              style={{ background: "transparent", boxShadow: "none", border: 0 }}
            />
          )}
        </div>
        <div className={collapsed ? "px-1 pb-2" : "px-2 pb-2"}>
          <StoreSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent className="sidebar-scroll">
        {renderGroup("Gestão e Inteligência", ops)}
        <div className="px-3 -mt-1 mb-1">
          <div className="h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
        </div>
        {renderGroup("", main, { hideLabel: true })}
        {renderGroup("Configuração", config.filter((it) => it.url !== "/painel/usuarios" || showAdmin))}
        {isAdminMaster(role as any) && renderGroup("Financeiro / Admin Master", adminMasterItems)}
        <div className="px-2 pt-2">
          <NavLink to="/painel/indique-e-ganhe"
            className={({ isActive }) =>
              `mx-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-gradient-primary text-primary-foreground border-primary shadow-glow"
                  : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
              } ${collapsed ? "justify-center" : ""}`}>
            <Gift className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Indique e Ganhe</span>}
          </NavLink>
        </div>
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