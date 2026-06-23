import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, Users, Receipt, DollarSign, TrendingUp, Inbox, LogOut,
} from "lucide-react";

const nav = [
  { to: "/mobileplus/visao-geral", label: "Visão Geral", icon: LayoutDashboard },
  { to: "/mobileplus/lojas",       label: "Lojas",        icon: Building2 },
  { to: "/mobileplus/usuarios",    label: "Usuários",     icon: Users },
  { to: "/mobileplus/assinaturas", label: "Assinaturas",  icon: Receipt },
  { to: "/mobileplus/financeiro",  label: "Financeiro",   icon: DollarSign },
  { to: "/mobileplus/crescimento", label: "Crescimento",  icon: TrendingUp },
  { to: "/mobileplus/suporte",     label: "Suporte",      icon: Inbox },
];

export default function MobilePlusLayout() {
  const navigate = useNavigate();
  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/mobileplus", { replace: true });
  };
  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="text-xl font-bold tracking-tight text-[#00abfb]">Mobile+</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">
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
      <main className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}