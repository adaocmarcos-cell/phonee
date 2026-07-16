import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, Users, Receipt, DollarSign, TrendingUp, Inbox, LogOut, UserPlus, Target, Ticket, ShieldAlert, ShieldCheck, Crown, Layers, Stethoscope,
  Megaphone, Link2, ScrollText, ChevronDown, Gift, Settings2, ShoppingBag, CreditCard,
} from "lucide-react";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";

type NavItem = { to: string; label: string; icon: any };
type NavGroup = { id: string; label: string; icon: any; items: NavItem[] };

const groups: NavGroup[] = [
  { id: "visao", label: "Visão Geral", icon: LayoutDashboard, items: [
    { to: "/phonee/visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  ]},
  { id: "contas", label: "Contas & Lojas", icon: Layers, items: [
    { to: "/phonee/contas",   label: "Contas",   icon: Layers },
    { to: "/phonee/lojas",    label: "Lojas",    icon: Building2 },
    { to: "/phonee/usuarios", label: "Usuários", icon: Users },
    { to: "/phonee/vinculos", label: "Vínculos", icon: Link2 },
  ]},
  { id: "comercial", label: "Comercial", icon: ShoppingBag, items: [
    { to: "/phonee/leads",       label: "Leads",       icon: UserPlus },
    { to: "/phonee/leads-ads",   label: "Leads Ads",   icon: Megaphone },
    { to: "/phonee/cupons",      label: "Cupons",      icon: Ticket },
    { to: "/phonee/marketing",   label: "Marketing",   icon: Target },
    { to: "/phonee/crescimento", label: "Crescimento", icon: TrendingUp },
  ]},
  { id: "faturamento", label: "Faturamento", icon: CreditCard, items: [
    { to: "/phonee/assinaturas",              label: "Assinaturas",   icon: Receipt },
    { to: "/phonee/assinaturas/solicitacoes", label: "Aprovações",    icon: ShieldCheck },
    { to: "/phonee/financeiro",               label: "Financeiro",    icon: DollarSign },
    { to: "/phonee/bonificacoes",             label: "Bonificações",  icon: Gift },
  ]},
  { id: "suporte", label: "Suporte", icon: Inbox, items: [
    { to: "/phonee/suporte", label: "Suporte", icon: Inbox },
  ]},
  { id: "sistema", label: "Sistema", icon: Settings2, items: [
    { to: "/phonee/auditoria",   label: "Auditoria",    icon: ShieldAlert },
    { to: "/phonee/audit-log",   label: "Audit Log",    icon: ScrollText },
    { to: "/phonee/diagnostico", label: "Diagnóstico",  icon: Stethoscope },
    { to: "/phonee/admins",      label: "Admins Master", icon: Crown },
  ]},
];

const OPEN_KEY = "phonee:menu:open-groups";

function activeGroupId(pathname: string): string | null {
  for (const g of groups) {
    if (g.items.some((i) => pathname === i.to || pathname.startsWith(i.to + "/"))) return g.id;
  }
  return null;
}

export default function PhoneeLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set(["contas", "faturamento"]);
  });

  const activeId = useMemo(() => activeGroupId(pathname), [pathname]);
  useEffect(() => {
    if (activeId && !open.has(activeId)) {
      const next = new Set(open);
      next.add(activeId);
      setOpen(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(Array.from(open))); } catch {}
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(open);
    next.has(id) ? next.delete(id) : next.add(id);
    setOpen(next);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/phonee", { replace: true });
  };

  const renderGroup = (g: NavGroup) => {
    const isOpen = open.has(g.id) || activeId === g.id;
    const isSingle = g.items.length === 1;
    if (isSingle) {
      const only = g.items[0];
      return (
        <NavLink
          key={g.id}
          to={only.to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-5 py-2.5 text-sm transition ${
              isActive
                ? "bg-[#00abfb] text-slate-900 font-semibold"
                : "text-slate-300 hover:bg-slate-800"
            }`
          }
        >
          <g.icon className="h-4 w-4" />
          {g.label}
        </NavLink>
      );
    }
    return (
      <div key={g.id}>
        <button
          onClick={() => toggle(g.id)}
          className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition ${
            activeId === g.id ? "text-slate-100" : "text-slate-400"
          } hover:bg-slate-800`}
        >
          <g.icon className="h-4 w-4" />
          <span className="flex-1 text-left">{g.label}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && (
          <div className="pb-1">
            {g.items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 pl-11 pr-5 py-2 text-[13px] transition ${
                    isActive
                      ? "bg-[#00abfb] text-slate-900 font-semibold"
                      : "text-slate-300 hover:bg-slate-800"
                  }`
                }
              >
                <i.icon className="h-3.5 w-3.5" />
                {i.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-slate-800 bg-slate-900 flex-col">
        <div className="px-5 py-4 border-b border-slate-800 flex flex-col items-start gap-1.5">
          <img
            src={logoAsset.url}
            alt="Phonee"
            className="h-7 w-auto object-contain select-none"
            draggable={false}
          />
          <div className="text-[10px] uppercase tracking-widest text-slate-500">
            Console do Gestor
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto sidebar-scroll">
          {groups.map(renderGroup)}
        </nav>
        <div className="p-3 border-t border-slate-800">
          <Button variant="ghost" onClick={logout}
            className="w-full justify-start text-slate-300 hover:bg-slate-800 hover:text-slate-100">
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      {/* Topbar mobile */}
      <header className="md:hidden sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex flex-col gap-0.5 min-w-0">
            <img
              src={logoAsset.url}
              alt="Phonee"
              className="h-5 w-auto object-contain select-none"
              draggable={false}
            />
            <div className="text-[9px] uppercase tracking-widest text-slate-500">Console do Gestor</div>
          </div>
          <Button size="sm" variant="ghost" onClick={logout}
            className="text-slate-300 hover:bg-slate-800 hover:text-slate-100 h-8 px-2">
            <LogOut className="h-[1.15rem] w-[1.15rem]" />
          </Button>
        </div>
        <nav className="px-3 pb-2 space-y-1 sidebar-scroll max-h-[60vh] overflow-y-auto">
          {groups.map((g) => {
            const isOpen = open.has(g.id) || activeId === g.id;
            const isSingle = g.items.length === 1;
            if (isSingle) {
              const only = g.items[0];
              return (
                <NavLink
                  key={g.id}
                  to={only.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition ${
                      isActive ? "bg-[#00abfb] text-slate-900 font-semibold" : "bg-slate-800/60 text-slate-300"
                    }`
                  }
                >
                  <g.icon className="h-4 w-4" /> {g.label}
                </NavLink>
              );
            }
            return (
              <div key={g.id} className="rounded-md bg-slate-800/40 overflow-hidden">
                <button
                  onClick={() => toggle(g.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-200"
                >
                  <g.icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{g.label}</span>
                  <ChevronDown className={`h-3 w-3 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-1 p-2 pt-0">
                    {g.items.map((i) => (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        className={({ isActive }) =>
                          `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
                            isActive
                              ? "bg-[#00abfb] text-slate-900 font-semibold"
                              : "bg-slate-800 text-slate-300"
                          }`
                        }
                      >
                        <i.icon className="h-3 w-3" /> {i.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 overflow-auto overflow-x-hidden">
        <div className="p-3 sm:p-5 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}