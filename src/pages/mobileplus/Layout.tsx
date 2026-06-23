import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, Users, Receipt, DollarSign, TrendingUp, Inbox, LogOut,
} from "lucide-react";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";

const nav = [
  { to: "/phonee/visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  { to: "/phonee/lojas",       label: "Lojas",        icon: Building2 },
  { to: "/phonee/usuarios",    label: "Usuários",     icon: Users },
  { to: "/phonee/assinaturas", label: "Assinaturas",  icon: Receipt },
  { to: "/phonee/financeiro",  label: "Financeiro",   icon: DollarSign },
  { to: "/phonee/crescimento", label: "Crescimento",  icon: TrendingUp },
  { to: "/phonee/suporte",     label: "Suporte",      icon: Inbox },
];

export default function PhoneeLayout() {
  const navigate = useNavigate();
  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/phonee", { replace: true });
  };
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100">
      <aside className="hidden md:flex w-60 shrink-0 border-r border-slate-800 bg-slate-900 flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <img src={logoAsset.url} alt="Phonee" className="h-8 w-auto" />
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-2">
            Console do Gestor
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-[#00abfb] text-slate-900 font-semibold"
                    : "text-slate-300 hover:bg-slate-800"
                }`}>
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
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
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <img src={logoAsset.url} alt="Phonee" className="h-6 w-auto" />
            <div className="text-[9px] uppercase tracking-widest text-slate-500">Console do Gestor</div>
          </div>
          <Button size="sm" variant="ghost" onClick={logout}
            className="text-slate-300 hover:bg-slate-800 hover:text-slate-100 h-8 px-2">
            <LogOut className="h-[1.15rem] w-[1.15rem]" />
          </Button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sidebar-scroll">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) =>
                `shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  isActive
                    ? "bg-[#00abfb] text-slate-900 font-semibold"
                    : "bg-slate-800/60 text-slate-300 hover:bg-slate-800"
                }`}>
              <n.icon className="h-[1.15rem] w-[1.15rem]" />
              {n.label}
            </NavLink>
          ))}
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