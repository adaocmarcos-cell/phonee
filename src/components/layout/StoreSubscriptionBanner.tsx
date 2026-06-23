import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function StoreSubscriptionBanner() {
  const { activeStoreSubscription, store } = useAuth();
  const navigate = useNavigate();
  if (!store || !activeStoreSubscription) return null;
  const s = activeStoreSubscription;
  const ok = s.subscription_status === "ativa" || s.subscription_status === "active" || s.subscription_status === "aprovado";
  if (ok) return null;

  const label =
    s.subscription_status === "sem_assinatura" ? "Esta loja ainda não tem uma assinatura ativa."
    : s.subscription_status === "atrasada" || s.subscription_status === "vencida" || s.subscription_status === "overdue"
      ? "A assinatura desta loja está vencida."
      : "A assinatura desta loja está com pagamento pendente.";

  return (
    <div className="mx-4 md:mx-6 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 flex items-center gap-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-amber-700">{label}</span>{" "}
        <span className="text-amber-700/80">Você ainda pode usar normalmente, mas regularize para evitar bloqueios.</span>
      </div>
      <button
        onClick={() => navigate("/painel/lojas")}
        className="text-amber-700 hover:text-amber-900 text-xs font-semibold inline-flex items-center gap-1"
      >
        Regularizar <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}