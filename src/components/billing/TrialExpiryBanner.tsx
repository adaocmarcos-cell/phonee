import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Clock, Crown, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type TrialSub = {
  id: string;
  expires_at: string | null;
  status: string;
  customer_email: string;
};

const DISMISS_KEY = "phonee_trial_banner_dismissed";

export function TrialExpiryBanner() {
  const { user } = useAuth();
  const [sub, setSub] = useState<TrialSub | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id,expires_at,status,customer_email")
        .eq("billing_cycle", "trial")
        .or(`user_id.eq.${user.id},customer_email.eq.${user.email.toLowerCase()}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setSub((data as TrialSub | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email]);

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(DISMISS_KEY);
      if (v === sub?.id) setDismissed(true);
    } catch {}
  }, [sub?.id]);

  if (!sub || !sub.expires_at || dismissed) return null;

  const expires = new Date(sub.expires_at);
  const now = new Date();
  const msLeft = expires.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / 86400000);
  const expired = msLeft <= 0;

  // Mostra somente em <=7 dias ou se expirado
  if (!expired && daysLeft > 7) return null;

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, sub.id); } catch {}
  };

  return (
    <div
      className={`border-b px-4 py-3 flex flex-wrap items-center gap-3 ${
        expired
          ? "bg-danger/10 border-danger/30 text-danger-foreground"
          : daysLeft <= 3
            ? "bg-warning/10 border-warning/30"
            : "bg-info/10 border-info/30"
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-[260px]">
        {expired ? <AlertTriangle className="h-5 w-5 text-danger" /> : <Clock className="h-5 w-5 text-warning" />}
        <div className="text-sm leading-tight">
          <div className="font-semibold">
            {expired
              ? "Sua Mensalidade Teste expirou"
              : daysLeft <= 1
                ? "Sua Mensalidade Teste expira hoje"
                : `Sua Mensalidade Teste expira em ${daysLeft} dias`}
          </div>
          <div className="text-xs text-muted-foreground">
            {expired
              ? "Reative o acesso contratando o Plano Anual ou Vitalício — a Mensalidade Teste não pode ser renovada."
              : `Validade até ${expires.toLocaleDateString("pt-BR")}. Garanta agora seu plano definitivo.`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="default" className="gap-1.5">
          <Link to="/comprar?plano=annual"><Rocket className="h-4 w-4" /> Plano Anual</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link to="/comprar?plano=lifetime"><Crown className="h-4 w-4" /> Vitalício</Link>
        </Button>
        {!expired && (
          <Button size="icon" variant="ghost" onClick={dismiss} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}