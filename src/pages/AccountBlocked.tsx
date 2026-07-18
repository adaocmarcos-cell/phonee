import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, MessageCircle, Check, Loader2, ArrowRight } from "lucide-react";
import blockedImg from "@/assets/blocked-illustration.png";
import { brl } from "@/lib/format";

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_period: string | null;
  max_installments: number | null;
  display_order: number | null;
};

function periodLabel(p: string | null): string {
  switch ((p ?? "").toLowerCase()) {
    case "monthly": return "/mês";
    case "yearly":
    case "annual": return "/ano";
    case "lifetime": return " · pagamento único";
    default: return "";
  }
}

export default function AccountBlocked() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("my_access_block_status" as any);
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.store_name) setStoreName(row.store_name as string);
    })();
    (async () => {
      setLoadingPlans(true);
      const { data } = await supabase
        .from("plans")
        .select("id,code,name,description,price_cents,billing_period,max_installments,display_order")
        .eq("active", true)
        .order("display_order", { ascending: true });
      setPlans((data as Plan[]) ?? []);
      setLoadingPlans(false);
    })();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/entrar", { replace: true });
  };

  // destaca o plano do meio, ou o com maior duração, senão o primeiro
  const highlightedId = (() => {
    if (plans.length === 0) return null;
    if (plans.length >= 3) return plans[1]!.id;
    return plans[0]!.id;
  })();

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="max-w-5xl mx-auto rounded-2xl border border-border bg-surface/40 backdrop-blur p-6 sm:p-10 shadow-xl">
       <div className="text-center max-w-2xl mx-auto">
        <img
          src={blockedImg}
          alt=""
          width={144}
          height={144}
          loading="lazy"
          className="mx-auto h-32 w-32 sm:h-36 sm:w-36 mb-4 select-none"
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Olá! Que bom ter você por aqui <span aria-hidden>💙</span>
        </h1>
        {storeName && (
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            {storeName}
          </p>
        )}
        <div className="mt-5 space-y-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
          <p>
            Seu período de acesso ao <strong className="text-foreground">Phonee</strong> chegou
            ao fim, mas a gente não quer que sua loja pare!
          </p>
          <p>
            Escolha abaixo o plano ideal para você. Seus dados continuam guardados
            com segurança. <span aria-hidden>😉</span>
          </p>
        </div>
       </div>

        {/* Planos in-line */}
        <div className="mt-8">
          {loadingPlans ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando planos…
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-8">
              <Button size="lg" onClick={() => navigate("/comprar")} className="gap-2">
                Escolher meu plano <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => {
                const highlighted = p.id === highlightedId;
                return (
                  <div
                    key={p.id}
                    className={
                      "relative rounded-2xl p-6 flex flex-col text-left transition-all " +
                      (highlighted
                        ? "border-2 border-primary bg-primary/5 shadow-glow"
                        : "border border-border bg-card hover:border-primary/50")
                    }
                  >
                    {highlighted && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
                        Mais escolhido
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                    {p.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-foreground">
                        {brl(p.price_cents / 100)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {periodLabel(p.billing_period)}
                      </span>
                    </div>
                    {p.max_installments && p.max_installments > 1 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        até {p.max_installments}x no cartão
                      </p>
                    )}
                    <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground flex-1">
                      <li className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        Acesso completo ao Phonee
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        Vendas, estoque e OS ilimitadas
                      </li>
                      <li className="flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                        Suporte prioritário
                      </li>
                    </ul>
                    <Button
                      size="lg"
                      onClick={() => navigate(`/comprar?plano=${encodeURIComponent(p.code)}`)}
                      variant={highlighted ? "default" : "outline"}
                      className="mt-5 w-full font-semibold"
                    >
                      Escolher {p.name}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="https://wa.me/5511999999999?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20acesso%20ao%20Phonee"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <MessageCircle className="h-4 w-4" />
            Falar com o suporte
          </a>
        </div>

        <div className="mt-8 pt-5 border-t border-border/60">
         <div className="text-center">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-danger transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair da conta
          </button>
         </div>
        </div>
      </div>
    </div>
  );
}