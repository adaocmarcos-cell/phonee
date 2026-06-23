import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, Check, ChevronDown, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useSidebar } from "@/components/ui/sidebar";

function statusBadge(status: string) {
  if (status === "ativa" || status === "active" || status === "aprovado") return null;
  if (status === "sem_assinatura") return { label: "Sem assinatura", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  if (status === "pendente" || status === "pending") return { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  if (status === "atrasada" || status === "vencida" || status === "overdue") return { label: "Vencida", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
  return { label: status, cls: "bg-muted text-muted-foreground border-border" };
}

export function StoreSwitcher() {
  const { store, stores, switchStore } = useAuth();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const onSelect = async (id: string) => {
    if (id === store?.id) return;
    await switchStore(id);
    toast.success("Loja ativa alterada");
  };

  if (!store) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`w-full flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 hover:bg-sidebar-accent transition-colors px-2 py-2 text-left ${collapsed ? "justify-center" : ""}`}
          aria-label="Trocar de loja"
        >
          <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground/70 leading-none">Loja ativa</div>
                <div className="text-sm font-semibold truncate leading-tight mt-0.5">{store.name}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Minhas lojas</span>
          <span className="text-[10px] font-mono text-muted-foreground">{stores.length}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stores.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">Nenhuma loja encontrada.</div>
        )}
        {stores.map((s) => {
          const badge = statusBadge(s.subscription_status);
          const isActive = s.store_id === store.id;
          return (
            <DropdownMenuItem
              key={s.store_id}
              onClick={() => onSelect(s.store_id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                {s.logo_url ? <img src={s.logo_url} alt="" className="h-6 w-6 rounded object-cover" /> : <Building2 className="h-3 w-3 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {s.is_owner && <span className="text-[9px] font-mono uppercase tracking-wider text-primary">Dono</span>}
                  {badge && (
                    <span className={`text-[9px] px-1.5 py-0 rounded border ${badge.cls} inline-flex items-center gap-0.5`}>
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {badge.label}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {s.billing_cycle === "lifetime" ? "Vitalício" : "Anual"}
                  </span>
                </div>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/app/admin/lojas")} className="cursor-pointer text-primary">
          <Plus className="h-4 w-4 mr-2" />
          Gerenciar / adicionar loja
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}