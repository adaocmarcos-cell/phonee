import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Receipt, Boxes, Users, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { memo, useEffect, useState } from "react";

type Item = {
  to?: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  action?: "openMenu";
};

const items: Item[] = [
  { to: "/painel", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/painel/vendas", label: "Vendas", icon: Receipt },
  { to: "/painel/estoque", label: "Estoque", icon: Boxes },
  { to: "/painel/clientes", label: "Clientes", icon: Users },
  { label: "Mais", icon: Menu, action: "openMenu" },
];

function MobileBottomNavBase() {
  const { setOpenMobile, isMobile } = useSidebar();
  const { pathname } = useLocation();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const compute = () => {
      const cl = document.documentElement.classList;
      setIsDark(cl.contains("dark") || cl.contains("theme-ocean"));
    };
    compute();
    const obs = new MutationObserver(compute);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Verificação automática: ao trocar o tema, confirma que o fundo, ícones
  // e estilos da barra ficaram coerentes (sem flicker de cor entre claro/escuro).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = requestAnimationFrame(() => {
      const root = document.documentElement;
      const dark = root.classList.contains("dark") || root.classList.contains("theme-ocean");
      if (dark !== isDark) setIsDark(dark);
    });
    return () => cancelAnimationFrame(id);
  }, [isDark]);

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-[440px] animate-fade-in-up will-change-transform"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
      }}
    >
      <ul
        className={cn(
          "flex items-center justify-around h-[70px] rounded-[34px] px-2",
          "shadow-[0_8px_30px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.08)]",
          "backdrop-blur-xl transition-colors duration-200 ease-out",
          isDark ? "bg-black" : "bg-white"
        )}
      >
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.to
            ? it.end
              ? pathname === it.to
              : pathname === it.to || pathname.startsWith(it.to + "/")
            : false;

          const baseBtn =
            cn(
              "group flex flex-col items-center justify-center gap-0.5",
              "min-w-[44px] min-h-[44px] px-3 py-1.5 rounded-2xl",
              "transition-[color,transform,background-color] duration-200 ease-out",
              "outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2",
              isDark ? "focus-visible:ring-offset-black" : "focus-visible:ring-offset-white",
              "hover:bg-neutral-400/10 active:scale-[0.96]"
            );

          const iconCls = cn(
            "h-[1.55rem] w-[1.55rem] transition-transform duration-200 ease-out",
            active ? "scale-[1.08]" : "scale-100",
            active ? "text-[#0EA5E9]" : "text-neutral-400"
          );

          const labelCls = cn(
            "text-[10px] leading-none font-medium tracking-tight transition-opacity duration-200",
            active ? "text-[#0EA5E9] opacity-100" : "text-neutral-400 opacity-90"
          );

          if (it.action === "openMenu") {
            return (
              <li key="more">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  onClick={() => setOpenMobile(true)}
                  className={baseBtn}
                >
                  <Icon className={iconCls} />
                  <span className={labelCls}>{it.label}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={it.to}>
              <NavLink
                to={it.to!}
                end={it.end}
                className={baseBtn}
                aria-label={it.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon className={iconCls} />
                <span className={labelCls}>{it.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const MobileBottomNav = memo(MobileBottomNavBase);