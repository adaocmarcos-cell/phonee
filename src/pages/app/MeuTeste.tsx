import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock, Crown, Rocket, ShieldCheck } from "lucide-react";

type Extras = { expires_at: string | null; status: string | null };
type Trial = {
  status: string | null; trial_ends_at: string | null;
  activated_at: string | null; full_access_ends_at: string | null;
  full_access_granted_at: string | null;
};

const fmt = (s?: string | null) => s ? new Date(s).toLocaleDateString("pt-BR") : "—";

export default function MeuTeste() {
  const { user } = useAuth();
  const [extras, setExtras] = useState<Extras | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: e }, { data: t }] = await Promise.all([
        supabase.from("user_profile_extras").select("expires_at,status").eq("user_id", user.id).maybeSingle(),
        supabase.from("partner_trials").select("status,trial_ends_at,activated_at,full_access_ends_at,full_access_granted_at")
          .eq("user_id", user.id).order("invited_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setExtras((e as any) ?? null);
      setTrial((t as any) ?? null);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando status do teste…</div>;
  }

  const endsAt = trial?.full_access_ends_at || trial?.trial_ends_at || extras?.expires_at || null;
  const startAt = trial?.activated_at || null;
  const now = Date.now();
  const endMs = endsAt ? new Date(endsAt).getTime() : null;
  const daysLeft = endMs ? Math.ceil((endMs - now) / 86400000) : null;
  const expired = endMs !== null && endMs <= now;
  const released = !!trial?.full_access_granted_at && !expired;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" /> Meu teste grátis
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe o status do seu acesso ao Phonee e o que fazer para continuar usando.
        </p>
      </div>

      <Card className={`p-5 border ${
        expired ? "border-danger/40 bg-danger/5"
        : released ? "border-success/40 bg-success/5"
        : (daysLeft !== null && daysLeft <= 3) ? "border-warning/40 bg-warning/5"
        : "border-info/40 bg-info/5"
      }`}>
        <div className="flex items-center gap-2 mb-3">
          {expired ? <AlertTriangle className="h-5 w-5 text-danger" />
            : released ? <CheckCircle2 className="h-5 w-5 text-success" />
            : <Clock className="h-5 w-5 text-info" />}
          <div className="font-semibold">
            {expired ? "Seu acesso expirou"
              : released ? "Acesso liberado"
              : (daysLeft !== null && daysLeft <= 1) ? "Seu teste expira hoje"
              : `Seu teste expira em ${daysLeft ?? "—"} dias`}
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Início</div>
            <div className="font-semibold mt-1">{fmt(startAt)}</div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Expiração</div>
            <div className="font-semibold mt-1">{fmt(endsAt)}</div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Restante</div>
            <div className="font-semibold mt-1">
              {expired ? <span className="text-danger">Expirado</span>
                : daysLeft !== null ? `${Math.max(0, daysLeft)} dias`
                : "—"}
            </div>
          </div>
        </div>
      </Card>

      {expired && (
        <Card className="p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Como voltar a usar o Phonee
          </div>
          <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1.5">
            <li>Escolha um plano definitivo (Anual ou Vitalício).</li>
            <li>Realize o pagamento via PIX ou cartão — liberação é imediata após confirmação.</li>
            <li>Seu cadastro, dados e histórico permanecem intactos.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild className="gap-1.5">
              <Link to="/comprar?plano=annual"><Rocket className="h-4 w-4" /> Assinar Plano Anual</Link>
            </Button>
            <Button asChild variant="outline" className="gap-1.5">
              <Link to="/comprar?plano=lifetime"><Crown className="h-4 w-4" /> Plano Vitalício</Link>
            </Button>
          </div>
        </Card>
      )}

      {!expired && (
        <Card className="p-5">
          <div className="font-semibold flex items-center gap-2 mb-2">
            <Rocket className="h-5 w-5 text-primary" /> Aproveite ao máximo seu teste
          </div>
          <p className="text-sm text-muted-foreground">
            Cadastre seus produtos, lance vendas reais e teste a operação no dia a dia.
            Quando estiver pronto, contrate um plano definitivo para manter o acesso sem interrupções.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/comprar?plano=annual"><Rocket className="h-4 w-4" /> Ver plano Anual</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/comprar?plano=lifetime"><Crown className="h-4 w-4" /> Ver Vitalício</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}