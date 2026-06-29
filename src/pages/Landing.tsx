import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { DemoLeadModal } from "@/components/DemoLeadModal";
import { LandingReferralSignupDialog } from "@/components/LandingReferralSignupDialog";
import { FreeTrialSignupDialog } from "@/components/FreeTrialSignupDialog";
import { trackPageVisit } from "@/lib/trackVisit";
import { trackMetaEvent } from "@/lib/metaPixel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal, useParallax } from "@/components/Reveal";
import {
  ShieldCheck, TrendingUp, AlertTriangle, Users, Workflow, Building2,
  Boxes, Wrench, RefreshCw, Wallet, Check, X,
  ArrowRight, Lock, CheckCircle2, Star, Apple, Smartphone, UsersRound, Play,
  DollarSign, Percent, Package, Gift, Loader2, type LucideIcon,
} from "lucide-react";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";
const logo = logoAsset.url;

/* ---------- building blocks ---------- */

function SectionTitle({ eyebrow, title, subtitle, light = false }: {
  eyebrow?: string; title: string; subtitle?: string; light?: boolean;
}) {
  return (
    <div className="max-w-3xl mx-auto text-center mb-14">
      {eyebrow && (
        <div className="text-xs md:text-sm font-mono tracking-[0.3em] mb-4 text-primary font-bold">
          {eyebrow}
        </div>
      )}
      <h2 className={`text-4xl md:text-6xl font-extrabold tracking-tight ${light ? "text-white" : "text-foreground"}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-5 text-lg md:text-xl font-medium ${light ? "text-slate-200" : "text-foreground/80"}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function BenefitCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <Card className="p-6 bg-card border-2 border-border hover:border-primary transition-all hover:shadow-glow group">
      <div className="h-14 w-14 rounded-xl bg-primary/15 border-2 border-primary/40 flex items-center justify-center mb-4 group-hover:bg-primary/25 transition-colors">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h3 className="font-extrabold text-xl md:text-2xl mb-2">{title}</h3>
      <p className="text-base md:text-lg text-foreground/80 font-medium leading-relaxed">{desc}</p>
    </Card>
  );
}

function CheckItem({ children, negative = false, big = false }: { children: React.ReactNode; negative?: boolean; big?: boolean }) {
  const size = big ? "h-6 w-6" : "h-5 w-5";
  return (
    <li className={`flex items-start gap-3 ${big ? "text-base md:text-lg font-normal" : "text-sm font-normal"}`}>
      {negative ? (
        <X className={`${size} text-danger shrink-0 mt-0.5`} strokeWidth={3} />
      ) : (
        <CheckCircle2 className={`${size} text-success shrink-0 mt-0.5`} strokeWidth={2.25} />
      )}
      <span>{children}</span>
    </li>
  );
}

function DashStat({
  label, value, sub, tone = "primary", icon: Icon, highlight = false, className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "info" | "violet" | "danger" | "success" | "warning";
  icon?: LucideIcon;
  highlight?: boolean;
  className?: string;
}) {
  const grad: Record<string, string> = {
    primary: "from-blue-500 via-blue-600 to-indigo-700 border-blue-400/40",
    info:    "from-sky-400 via-sky-500 to-blue-600 border-sky-300/40",
    violet:  "from-fuchsia-500 via-purple-600 to-indigo-700 border-purple-400/40",
    danger:  "from-rose-500 via-red-600 to-red-700 border-red-400/40",
    success: "from-emerald-500 via-emerald-600 to-emerald-700 border-emerald-400/40",
    warning: "from-amber-400 via-orange-500 to-orange-600 border-orange-400/40",
  };
  return (
    <div
      className={`relative rounded-2xl border bg-gradient-to-br ${grad[tone]} text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] overflow-hidden ${
        highlight ? "p-6 md:p-7" : "px-4 py-3 md:p-5"
      } ${className}`}
    >
      {/* Mobile compact: label esquerda · valor direita (apenas para cards não-highlight) */}
      {!highlight && (
        <div className="md:hidden flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            {Icon && (
              <div className="h-7 w-7 rounded-md bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[9px] font-mono tracking-[0.18em] uppercase font-semibold text-white/85 leading-tight truncate">
                {label}
              </div>
              {sub && (
                <div className="text-[10px] text-white/80 font-medium leading-tight mt-0.5 truncate">
                  {sub}
                </div>
              )}
            </div>
          </div>
          <div className="metric font-bold leading-none text-xl text-right shrink-0">{value}</div>
        </div>
      )}

      {/* Desktop / highlight: layout original empilhado */}
      <div className={highlight ? "" : "hidden md:block"}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-[10px] md:text-[11px] font-mono tracking-[0.18em] uppercase font-semibold text-white/90">
            {label}
          </span>
          {Icon && (
            <div className="h-8 w-8 md:h-9 md:w-9 rounded-md bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 md:h-[18px] md:w-[18px] text-white" />
            </div>
          )}
        </div>
        <div className={`metric font-bold leading-tight ${highlight ? "text-5xl md:text-6xl" : "text-3xl md:text-4xl"}`}>
          {value}
        </div>
        {sub && <div className={`mt-2 ${highlight ? "text-sm" : "text-xs"} text-white/85 font-medium`}>{sub}</div>}
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function Landing() {
  const heroLogoOffset = useParallax(0.12);
  const heroGlowOffset = useParallax(0.25);
  const navigate = useNavigate();
  const [demoOpen, setDemoOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [freeTrialOpen, setFreeTrialOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<null | "trial" | "annual" | "lifetime">(null);
  // Garante que o estado de loading do botão Trial é resetado quando o dialog fecha.
  useEffect(() => {
    if (!freeTrialOpen && pendingPlan === "trial") setPendingPlan(null);
  }, [freeTrialOpen, pendingPlan]);
  // "Ver demonstração" foi temporariamente desativado — agora abre "Experimente grátis".
  const handleDemo = () => setFreeTrialOpen(true);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // deep-link /?demo=1 agora aponta para o cadastro grátis
    if (p.get("demo") === "1" || p.get("demonstracao") === "1" || p.get("trial") === "1") {
      setFreeTrialOpen(true);
    }
    if (p.get("indique") === "1" || p.get("indicacao") === "1") setRefOpen(true);
    trackPageVisit("/");
    // Conversão Meta: visualização da página de vendas
    trackMetaEvent("ViewContent", {
      custom: { content_name: "Landing Phonee", content_category: "sales_page" },
    });
  }, []);

  // Helper: registra InitiateCheckout / Lead em qualquer CTA de plano (hero, cards ou final).
  // Garante consistência de evento, valor, moeda e fonte para todos os botões.
  const PLAN_META: Record<"trial" | "annual" | "lifetime", { value: number; name: string; event: "InitiateCheckout" | "Lead" }> = {
    trial:    { value: 0,   name: "Trial 7 dias",   event: "Lead" },
    annual:   { value: 127, name: "Plano Anual",    event: "InitiateCheckout" },
    lifetime: { value: 297, name: "Plano Vitalício", event: "InitiateCheckout" },
  };
  // Deduplicação simples (mesmo plano+source disparado em < 800ms = ignorado)
  const lastTrackRef = useRef<{ key: string; ts: number } | null>(null);
  const trackCheckoutClick = (plan: "trial" | "annual" | "lifetime", source: string) => {
    const key = `${plan}:${source}`;
    const now = Date.now();
    if (lastTrackRef.current && lastTrackRef.current.key === key && now - lastTrackRef.current.ts < 800) return;
    lastTrackRef.current = { key, ts: now };
    const meta = PLAN_META[plan];
    trackMetaEvent(meta.event, {
      value: meta.value,
      currency: "BRL",
      custom: { content_name: meta.name, content_category: "subscription", plan, source },
    });
  };

  // Inicia o fluxo de compra/ativação a partir dos cards — mesma rota usada em /comprar.
  const goToPlan = (plan: "annual" | "lifetime", source: string) => {
    if (pendingPlan) return;
    setPendingPlan(plan);
    trackCheckoutClick(plan, source);
    // pequeno atraso para o feedback visual antes da navegação
    setTimeout(() => navigate(`/comprar?plano=${plan}`), 120);
  };

  const openTrialFlow = (source: string = "pricing_card") => {
    if (pendingPlan) return;
    setPendingPlan("trial");
    trackCheckoutClick("trial", source);
    setFreeTrialOpen(true);
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoLeadModal
        open={demoOpen}
        onOpenChange={setDemoOpen}
        onSuccess={() => navigate("/painel")}
      />
      <LandingReferralSignupDialog open={refOpen} onOpenChange={setRefOpen} />
      <FreeTrialSignupDialog open={freeTrialOpen} onOpenChange={setFreeTrialOpen} />
      {/* NAV — mesma cor do hero */}
      <header className="sticky top-0 z-50 bg-[hsl(226_50%_15%)] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <nav className="hidden md:flex items-center gap-8 text-sm font-normal text-white">
            <a href="#beneficios" className="hover:text-primary transition">Benefícios</a>
            <a href="#dashboard" className="hover:text-primary transition">Dashboard</a>
            <a href="#preco" className="hover:text-primary transition">Planos &amp; Preços</a>
            <a href="#garantia" className="hover:text-primary transition">Garantia</a>
            <button
              type="button"
              onClick={() => setRefOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-emerald-200 hover:bg-emerald-500/25 hover:text-white transition"
            >
              <Gift className="h-3.5 w-3.5" />
              Indique e ganhe
            </button>
          </nav>
          <button
            type="button"
            onClick={() => setRefOpen(true)}
            className="md:hidden inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/25 hover:text-white transition"
          >
            <Gift className="h-3.5 w-3.5" />
            Indique
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              onClick={handleDemo}
              className="hidden sm:inline-flex border-primary/60 text-white bg-primary/15 hover:bg-primary/25 hover:text-white animate-neon-soft"
            >
              <Play className="h-4 w-4 mr-1.5" />
              Experimente grátis
            </Button>
            <Link to="/entrar">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10">
                Fazer login
              </Button>
            </Link>
            <Link to="/comprar?plano=annual" onClick={() => trackCheckoutClick("annual", "header")}>
              <Button className="bg-gradient-primary hidden sm:inline-flex animate-neon-pulse rounded-md">Comprar agora</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-[hsl(226_50%_15%)] text-white">
        <div className="absolute inset-0 opacity-[0.22] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.4) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div
          className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[140px] pointer-events-none will-change-transform"
          style={{ transform: `translate3d(0, ${heroGlowOffset}px, 0)` }}
        />
        <div
          className="absolute -bottom-40 -left-40 h-[420px] w-[420px] rounded-full bg-info/20 blur-[140px] pointer-events-none will-change-transform"
          style={{ transform: `translate3d(0, ${-heroGlowOffset}px, 0)` }}
        />

        <div className="relative max-w-7xl mx-auto px-5 pt-3 pb-16 lg:pt-4 lg:pb-20">
          {/* LOGO PRINCIPAL — totalmente transparente, tamanho padrão */}
          <div
            className="flex justify-center mt-0 mb-2 md:mb-3 will-change-transform"
            style={{ transform: `translate3d(0, ${heroLogoOffset}px, 0)` }}
          >
            <img
              src={logo}
              alt="Phonee"
              className="h-[168px] sm:h-[224px] md:h-[280px] lg:h-[336px] w-auto bg-transparent border-0 shadow-none"
              style={{ background: "transparent", boxShadow: "none", border: 0 }}
            />
          </div>
          <div className="-mt-1 mb-6 md:mb-8 text-center text-[11px] sm:text-xs md:text-sm font-mono tracking-[0.35em] uppercase text-slate-300/90">
            Gestão inteligente
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal direction="up" duration={1000}>
            <Badge className="mb-6 bg-primary/20 text-white border-primary/40 hover:bg-primary/25 text-sm py-1.5 px-3">
              Sistema especializado para lojas de smartphones, eletrônicos e assistências técnicas
            </Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.02] tracking-tight">
              Mais controle. <br />
              <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">Menos erros.</span> Mais lucro.
            </h1>
            <p className="mt-6 text-xl text-slate-200 max-w-xl leading-relaxed font-medium">
              O sistema criado para lojas de smartphones, eletrônicos e assistência técnica
              que querem organizar a operação, automatizar processos e acompanhar seus números em tempo real.
            </p>
            <div className="mt-8 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-3">
              {/* Mobile: linha 1 dividida em duas / Desktop: inline */}
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <a href="#beneficios" className="contents">
                  <Button size="lg" className="w-full sm:w-auto bg-gradient-primary shadow-glow text-base h-12 sm:px-7">
                    Ver vantagens <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </a>
                <a href="#preco" className="contents">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 sm:px-7 bg-white/5 text-white border-white/30 hover:bg-white/10 hover:text-white">
                    Ver planos
                  </Button>
                </a>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-2 text-base text-white/90 font-semibold">
              <ShieldCheck className="h-5 w-5 text-success" />
              Garantia total de 7 dias · Se não atender suas expectativas devolvemos 100% do valor pago, sem questionar.
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-sm font-semibold text-white">
              <UsersRound className="h-4 w-4 text-success" />
              Multiusuário incluso · sem cobrança adicional por colaborador
            </div>
          </Reveal>

          {/* Imagem/destaque do produto — CTAs e preços ficam após as vantagens */}
          <Reveal direction="right" duration={1100} delay={150} className="relative hidden lg:block">
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/30 to-info/20 blur-2xl rounded-3xl" />
            <Card className="relative p-10 bg-[hsl(224_25%_18%)] border border-white/10 text-white shadow-2xl">
              <div className="text-xs font-mono tracking-[0.3em] text-primary font-bold mb-3">VISÃO GERAL</div>
              <h3 className="text-3xl font-extrabold leading-tight">
                Gestão completa<br />em um único lugar
              </h3>
              <p className="mt-4 text-base text-slate-200 leading-relaxed">
                Estoque, vendas, assistência técnica, financeiro e indicadores —
                tudo conectado e em tempo real.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] font-mono tracking-widest text-slate-400">FATURAMENTO</div>
                  <div className="metric text-2xl mt-1">R$ 284k</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] font-mono tracking-widest text-slate-400">MARGEM</div>
                  <div className="metric text-2xl mt-1 text-success">32,4%</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] font-mono tracking-widest text-slate-400">OS ABERTAS</div>
                  <div className="metric text-2xl mt-1 text-warning">14</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="text-[10px] font-mono tracking-widest text-slate-400">ESTOQUE</div>
                  <div className="metric text-2xl mt-1 text-primary">1.284</div>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-2 text-xs text-slate-300">
                <Lock className="h-3 w-3 text-success" /> Dados protegidos com criptografia
              </div>
            </Card>
          </Reveal>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section id="beneficios" className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-5">
          <Reveal direction="up">
            <SectionTitle
              eyebrow="POR QUE PHONEE"
              title="O que o Phonee faz pela sua loja?"
              subtitle="Desenvolvido para eliminar processos manuais, reduzir falhas operacionais e entregar informações estratégicas para decisões mais rápidas e inteligentes."
            />
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {([
              { icon: ShieldCheck,   title: "Reduz erros operacionais",         desc: "Menos retrabalho, menos esquecimentos e mais padronização do começo ao fim do processo.", dir: "left"  },
              { icon: TrendingUp,    title: "Maximiza o lucro",                 desc: "Saiba exatamente quais produtos dão mais retorno e onde está sua margem real.",         dir: "up"    },
              { icon: AlertTriangle, title: "Evita falta de estoque",           desc: "Receba alertas e acompanhe movimentações em tempo real.",                                dir: "right" },
              { icon: Users,         title: "Diminui dependência de funcionários", desc: "A informação fica registrada no sistema — não na cabeça das pessoas.",              dir: "left"  },
              { icon: Workflow,      title: "Automatiza a operação",            desc: "Vendas, estoque, assistência técnica e finanças em um único ambiente.",                 dir: "up"    },
              { icon: Building2,     title: "Escale para múltiplas lojas",      desc: "Gerencie uma ou várias unidades com a mesma facilidade e visão consolidada.",          dir: "right" },
            ] as const).map((b, i) => (
              <Reveal key={b.title} direction={b.dir} delay={i * 80} distance={56}>
                <BenefitCard icon={b.icon} title={b.title} desc={b.desc} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PAIN SECTION */}
      <section className="py-20 md:py-28 bg-[hsl(0_0%_98%)]">
        <div className="max-w-6xl mx-auto px-5">
          <Reveal direction="up">
            <SectionTitle
              eyebrow="DORES COMUNS"
              title="Sua loja sofre com algum destes problemas?"
            />
          </Reveal>
          <Reveal direction="up" delay={80} className="grid md:grid-cols-2 gap-x-12 gap-y-4 max-w-4xl mx-auto">
            {[
              "Produtos sem controle",
              "Estoque desorganizado",
              "Vendas sem acompanhamento",
              "Falta de histórico de clientes",
              "Assistência técnica em papel ou WhatsApp",
              "Trocas sem rastreabilidade",
              "Funcionários dependentes de processos manuais",
              "Produtos parados ocupando capital",
              "Lucro desconhecido",
              "Compras feitas sem análise",
            ].map((p) => (
              <CheckItem key={p} negative big>{p}</CheckItem>
            ))}
          </Reveal>
          <Reveal direction="up" delay={150}>
            <p className="text-center mt-12 text-xl md:text-2xl font-bold">
              O Phonee foi criado exatamente para resolver esses problemas.
            </p>
          </Reveal>
        </div>
      </section>

      {/* DASHBOARD MOCKUP */}
      <section id="dashboard" className="relative py-20 md:py-28 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-7xl mx-auto px-5">
          <Reveal direction="up" className="max-w-4xl mx-auto text-center mb-14">
            <div className="text-sm md:text-base font-mono tracking-[0.3em] mb-4 text-primary font-bold">
              EM TEMPO REAL
            </div>
            <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
              Seus números mais importantes em segundos
            </h2>
            <p className="mt-6 text-xl md:text-2xl text-white/90 font-semibold">
              Mesmo em dias corridos você sabe exatamente como está sua operação.
            </p>
          </Reveal>

          <Reveal direction="up" delay={100} className="rounded-2xl border border-white/10 bg-[hsl(224_25%_18%)] shadow-2xl p-5 md:p-7 block">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10 mb-5">
              <div className="h-2.5 w-2.5 rounded-full bg-danger" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning" />
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <div className="ml-3 text-xs font-mono text-slate-300">phonee / dashboard</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              <Reveal direction="left"  delay={120}><DashStat label="Faturamento hoje"        value="R$ 12.847"  sub="Lucro bruto hoje: R$ 4.218" tone="primary" icon={DollarSign} /></Reveal>
              <Reveal direction="right" delay={180}><DashStat label="Faturamento — mês atual" value="R$ 284.560" sub="248 vendas"                  tone="info"    icon={TrendingUp} /></Reveal>
              <Reveal direction="left"  delay={240}><DashStat label="Margem média"            value="32,4%"      sub="Curva A em destaque"         tone="violet"  icon={Percent} /></Reveal>
              <Reveal direction="right" delay={300}><DashStat label="Estoque encalhado"       value="47"         sub="+30 dias sem venda"          tone="danger"  icon={Package} /></Reveal>
              <Reveal direction="up"    delay={380} className="md:col-span-2">
                <DashStat
                  label="Lucro líquido do período"
                  value="R$ 86.120"
                  sub="Receita − custo − despesas (R$ 18.940 desp.)"
                  tone="success"
                  icon={Wallet}
                  highlight
                />
              </Reveal>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-end gap-1.5 h-28">
                {[40, 60, 35, 75, 55, 90, 70, 95, 65, 80, 50, 100, 78].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-primary/30 to-primary"
                       style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-300 font-mono">Vendas dos últimos 13 dias</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FEATURE GRID */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-5 space-y-20">

          <Reveal direction="up">
            <div className="flex justify-center -mt-4">
              <Link
                to="/comprar?plano=annual"
                onClick={() => trackCheckoutClick("annual", "midpage_cta")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base md:text-lg font-extrabold text-primary-foreground shadow-glow hover:bg-primary/90 transition"
              >
                Quero mais lucro e menos perdas
              </Link>
            </div>
          </Reveal>

          <FeatureBlock
            icon={Boxes}
            eyebrow="ESTOQUE INTELIGENTE"
            title="Nunca mais perca vendas por falta de estoque"
            text="Tenha clareza sobre o que precisa comprar, vender ou liquidar."
            items={[
              "Controle de entradas", "Controle de saídas", "Histórico completo",
              "Controle por IMEI", "Controle por SKU", "Alertas de estoque mínimo",
              "Produtos mais vendidos", "Produtos sem giro", "Curva ABC automática",
            ]}
          />

          <FeatureBlock
            icon={Wrench}
            eyebrow="ASSISTÊNCIA TÉCNICA"
            title="Controle profissional das Ordens de Serviço"
            text="Todas as informações registradas e organizadas em um único ambiente."
            reverse
            items={[
              "Cadastro completo do aparelho", "IMEI", "Senha", "Checklist técnico",
              "Diagnóstico", "Fotos", "Histórico de atendimentos", "Status em tempo real",
              "Emissão de PDF", "Garantias registradas", "Controle de peças utilizadas",
            ]}
          />

          <FeatureBlock
            icon={RefreshCw}
            eyebrow="COMPRA E TROCA"
            title="Avaliações inteligentes e seguras"
            text="Mais segurança na compra e mais previsibilidade na revenda."
            items={[
              "Consulta de IMEI", "Saúde da bateria", "Checklist técnico",
              "Controle de Face ID", "Avaliação estética", "Cálculo de margem",
              "Histórico de compras", "Controle de aparelhos usados", "Estoque Trade-In",
            ]}
          />

          <FeatureBlock
            icon={Wallet}
            eyebrow="CUSTOS E DESPESAS"
            title="Descubra para onde seu dinheiro está indo"
            text="Conheça seu lucro real e tome decisões baseadas em números."
            reverse
            items={[
              "Aluguel", "Energia", "Internet", "Marketing", "Funcionários",
              "Impostos", "Compras", "Combustível", "Comissões", "Categorias personalizadas",
            ]}
          />
        </div>
      </section>

      {/* CURVA ABC */}
      <section className="py-20 md:py-28 bg-[hsl(0_0%_98%)]">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle
            eyebrow="CURVA ABC"
            title="Foque no que realmente gera resultado"
            subtitle="O sistema identifica automaticamente onde está seu lucro."
          />
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { c: "A", tone: "success", t: "Classe A", d: "Produtos responsáveis pela maior parte do faturamento." },
              { c: "B", tone: "primary", t: "Classe B", d: "Produtos intermediários — bom giro, margem moderada." },
              { c: "C", tone: "warning", t: "Classe C", d: "Produtos com menor impacto — atenção ao giro e ao capital parado." },
            ].map((x, i) => (
              <Reveal key={x.c} direction={i === 0 ? "left" : i === 2 ? "right" : "up"} delay={i * 120}>
              <Card className="p-7 text-center border-2 border-border">
                <div className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center text-3xl font-bold
                  ${x.tone === "success" ? "bg-success/10 text-success" :
                    x.tone === "primary" ? "bg-primary/10 text-primary" :
                    "bg-warning/10 text-warning"}`}>
                  {x.c}
                </div>
                <h3 className="mt-4 font-extrabold text-xl">{x.t}</h3>
                <p className="mt-2 text-base text-foreground/80 font-medium">{x.d}</p>
              </Card>
              </Reveal>
            ))}
          </div>
          <p className="text-center mt-10 text-xl font-bold">
            Compre melhor. Venda melhor. <span className="text-primary">Lucre mais.</span>
          </p>
        </div>
      </section>

      {/* MULTILOJAS */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle
            eyebrow="MULTILOJAS"
            title="Pronto para crescer junto com sua operação"
            subtitle="Tenha controle total mesmo com sua operação crescendo."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-4 max-w-4xl mx-auto">
            {[
              "Controle de múltiplas lojas", "Estoque por unidade", "Relatórios individuais",
              "Relatórios consolidados", "Usuários por loja", "Permissões por função",
              "Histórico completo",
            ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
          </div>
        </div>
      </section>

      {/* COMPARATIVO */}
      <section className="py-20 md:py-28 bg-[hsl(0_0%_98%)]">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle eyebrow="ANTES × DEPOIS" title="A diferença é clara" />
          <div className="grid md:grid-cols-2 gap-5">
            <Reveal direction="left">
            <Card className="p-7 border-2 border-danger/40 bg-danger/[0.04]">
              <h3 className="font-extrabold text-2xl mb-5 flex items-center gap-2 text-danger">
                <X className="h-7 w-7" strokeWidth={3.5} /> SEM PHONEE
              </h3>
              <ul className="space-y-3.5">
                {["Planilhas", "Informações espalhadas", "Processos manuais", "Dependência de funcionários",
                  "Erros frequentes", "Estoque desorganizado", "Falta de indicadores", "Menos lucro"
                ].map((i) => <CheckItem key={i} negative big>{i}</CheckItem>)}
              </ul>
            </Card>
            </Reveal>
            <Reveal direction="right" delay={120}>
            <Card className="p-7 border-2 border-success/50 bg-success/[0.05] shadow-glow">
              <h3 className="font-extrabold text-2xl mb-5 flex items-center gap-2 text-success">
                <CheckCircle2 className="h-7 w-7" /> COM PHONEE
              </h3>
              <ul className="space-y-3.5">
                {["Operação centralizada", "Controle profissional", "Dados organizados", "Menos erros",
                  "Mais produtividade", "Estoque inteligente", "Gestão simplificada", "Mais lucro"
                ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
              </ul>
            </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* GARANTIA */}
      <section id="garantia" className="relative py-20 md:py-28 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[420px] rounded-full bg-success/20 blur-[140px]" />
        <Reveal direction="scale" duration={1000} className="relative max-w-3xl mx-auto px-5 text-center">
          <div className="mx-auto h-24 w-24 rounded-3xl bg-success/15 border border-success/40 flex items-center justify-center shadow-2xl">
            <ShieldCheck className="h-12 w-12 text-success" />
          </div>
          <div className="mt-6 text-sm font-mono tracking-[0.3em] text-success font-bold">GARANTIA PREMIUM</div>
          <h2 className="mt-3 text-4xl md:text-6xl font-extrabold tracking-tight text-white">7 dias para testar sem risco</h2>
          <p className="mt-6 text-white/90 text-lg md:text-xl leading-relaxed font-medium">
            Experimente o Phonee com tranquilidade. Se nos primeiros 7 dias você concluir que o sistema
            não atende sua necessidade, devolvemos <span className="text-white font-bold">100% do valor</span> investido.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-base text-white font-semibold">
            <span className="flex items-center gap-2"><Check className="h-5 w-5 text-success" strokeWidth={3} /> Sem burocracia</span>
            <span className="flex items-center gap-2"><Check className="h-5 w-5 text-success" strokeWidth={3} /> Sem complicações</span>
            <span className="flex items-center gap-2"><Check className="h-5 w-5 text-success" strokeWidth={3} /> Sem risco</span>
          </div>
        </Reveal>
      </section>

      {/* PREÇO — Anual primeiro */}
      <section id="preco" className="py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle
            eyebrow="PREÇO"
            title="Sem mensalidades. Sem surpresas."
            subtitle="Experimente grátis por 7 dias. Depois, escolha Plano Anual ou Vitalício."
          />

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {/* Teste grátis — 7 dias */}
            <Reveal direction="left" duration={1000} className="relative">
              <div className="absolute -inset-2 bg-gradient-to-br from-info/40 to-primary/20 blur-2xl rounded-3xl" />
              <Card className="relative p-8 md:p-10 border-2 border-info/60 bg-card h-full flex flex-col">
                <Badge className="bg-info/15 text-info border-info/40 text-sm">
                  🎁 GRÁTIS · SEM CARTÃO
                </Badge>
                <div className="mt-4 text-base font-bold uppercase tracking-wide text-info">
                  Experimente grátis
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="metric text-6xl md:text-7xl text-info">7 dias</span>
                </div>
                <div className="mt-1 text-xl font-extrabold">Acesso completo · sem cobrança</div>
                <div className="mt-1 text-lg font-semibold text-foreground/80">
                  Teste o Phonee na sua loja antes de contratar. Cancelamento automático.
                </div>

                <ul className="mt-6 space-y-3">
                  {[
                    "Acesso total por 7 dias",
                    "Todos os módulos liberados",
                    "Sem cartão de crédito",
                    "Suporte humano por WhatsApp",
                    "Bloqueio automático ao final",
                  ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
                </ul>

                <div className="mt-auto">
                  <Button
                    size="lg"
                    type="button"
                    onClick={openTrialFlow}
                    disabled={pendingPlan !== null}
                    className="mt-7 w-full h-12 text-base bg-info hover:bg-info/90 text-white"
                  >
                    {pendingPlan === "trial" ? (
                      <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Abrindo cadastro…</>
                    ) : (
                      <>Experimente grátis por 7 dias <ArrowRight className="ml-1.5 h-4 w-4" /></>
                    )}
                  </Button>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-foreground/70 text-center">
                    Após 7 dias: <b>Anual</b> ou <b>Vitalício</b>.
                  </div>
                </div>
              </Card>
            </Reveal>

            {/* Anual — destaque */}
            <Reveal direction="left" duration={1000} delay={60} className="relative">
              <div className="absolute -inset-2 bg-gradient-to-br from-primary/40 to-info/25 blur-2xl rounded-3xl" />
              <Card className="relative p-8 md:p-10 border-2 border-border bg-card h-full flex flex-col">
                <Badge className="bg-success/15 text-success border-success/40 text-sm">
                  PLANO ANUAL
                </Badge>
                <div className="mt-4 text-base font-bold uppercase tracking-wide text-success">
                  Sem mensalidades
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="metric text-6xl md:text-7xl text-primary">R$ 127</span>
                </div>
                <div className="mt-1 text-xl font-extrabold">/anual</div>
                <div className="mt-1 text-lg font-semibold text-foreground/80">ou Parcelado em até 12x no cartão</div>

                <ul className="mt-6 space-y-3">
                  {[
                    "Sem mensalidade",
                    "Sem cobrança recorrente",
                    "Atualizações incluídas",
                    "Suporte dedicado",
                    "Garantia de 7 dias",
                  ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
                </ul>

                <div className="mt-auto">
                  <Button
                    size="lg"
                    type="button"
                    variant="outline"
                    onClick={() => goToPlan("annual", "pricing_card")}
                    disabled={pendingPlan !== null}
                    className="mt-7 w-full h-12 text-base border-2 border-primary text-primary hover:bg-primary hover:text-white"
                  >
                    {pendingPlan === "annual" ? (
                      <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Indo para o checkout…</>
                    ) : (
                      <>Assinar Plano Anual <ArrowRight className="ml-1.5 h-4 w-4" /></>
                    )}
                  </Button>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-foreground/70">
                    <Lock className="h-3 w-3" /> Pagamento 100% seguro · Acesso imediato
                  </div>
                </div>
              </Card>
            </Reveal>

            {/* Vitalício — destaque máximo */}
            <Reveal direction="right" duration={1000} delay={120} className="relative">
              <div className="absolute -inset-2 bg-gradient-to-br from-primary/50 to-info/30 blur-2xl rounded-3xl" />
              <Card className="relative p-8 md:p-10 border-2 border-primary bg-card h-full shadow-glow flex flex-col">
                <Badge className="bg-primary/15 text-primary border-primary/40 text-sm">
                  <Star className="h-3.5 w-3.5 mr-1" /> RECOMENDADO · MELHOR CUSTO-BENEFÍCIO
                </Badge>
                <div className="mt-4 text-base font-bold uppercase tracking-wide text-primary">
                  Plano Vitalício · Pagamento único
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="metric text-5xl md:text-6xl text-foreground/50 line-through">R$ 497</span>
                  <span className="metric text-6xl md:text-7xl text-primary">R$ 297</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-amber-600 dark:text-amber-400">Condição especial de lançamento, por tempo limitado.</div>
                <div className="mt-1 text-xl font-extrabold">Pague uma vez, use para sempre</div>
                <div className="mt-1 text-lg font-semibold text-foreground/80">
                  Em menos de 2 anos já se paga frente ao anual — depois disso, é 100% economia.
                </div>

                <ul className="mt-6 space-y-3">
                  {[
                    "Acesso vitalício ao sistema. *Condição por tempo limitado.",
                    "Sem renovação anual",
                    "Sem mensalidade nunca mais",
                    "Todas as atualizações futuras incluídas",
                    "Acesso antecipado a novos módulos",
                    "Suporte prioritário",
                    "Multiusuário e multiloja sem custo extra",
                    "Backup automático em nuvem",
                    "Garantia de 7 dias",
                  ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
                </ul>
                <p className="mt-3 text-xs text-foreground/70 leading-relaxed">
                  A assinatura do Plano Vitalício garante acesso permanente aos benefícios contratados,
                  sem cobranças de mensalidade ou renovação.
                </p>

                <div className="mt-auto">
                  <Button
                    size="lg"
                    type="button"
                    onClick={() => goToPlan("lifetime", "pricing_card")}
                    disabled={pendingPlan !== null}
                    className="mt-7 w-full bg-gradient-primary shadow-glow h-12 text-base"
                  >
                    {pendingPlan === "lifetime" ? (
                      <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Indo para o checkout…</>
                    ) : (
                      <>Quero o Plano Vitalício <ArrowRight className="ml-1.5 h-4 w-4" /></>
                    )}
                  </Button>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-foreground/70">
                    <Lock className="h-3 w-3" /> Pagamento 100% seguro · Acesso imediato
                  </div>
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative py-24 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <Reveal direction="up" duration={1100} className="relative max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Menos tempo organizando a loja. <br />
            <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">Mais tempo vendendo.</span>
          </h2>
          <p className="mt-6 text-xl text-white/90 font-medium">
            Automatize processos, reduza erros, acompanhe seus números diariamente
            e tenha mais liberdade para crescer.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/comprar?plano=annual" onClick={() => trackCheckoutClick("annual", "final_cta")}>
              <Button size="lg" className="bg-gradient-primary h-12 px-7 text-base animate-neon-pulse rounded-md">
                Comprar agora <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Button
              size="lg"
              type="button"
              onClick={() => setFreeTrialOpen(true)}
              className="h-12 px-7 text-base bg-info hover:bg-info/90 text-white rounded-md"
            >
              Experimente grátis por 7 dias
            </Button>
            <Link to="/entrar">
              <Button size="lg" variant="outline" className="h-12 px-7 text-base bg-white/5 text-white border-white/30 hover:bg-white/10 hover:text-white">
                Fazer login
              </Button>
            </Link>
          </div>

          <blockquote className="mt-16 max-w-3xl mx-auto text-xl md:text-2xl italic text-white leading-relaxed font-medium">
            "Quem controla seus números toma decisões melhores. Quem toma decisões melhores
            <span className="text-primary not-italic font-bold"> vende mais, erra menos e cresce com mais segurança.</span>"
          </blockquote>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="bg-black text-slate-300 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 pt-10 pb-2">
          <Reveal direction="up" className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 hover:bg-white/[0.07] transition-colors">
              <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Apple className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">Em breve</div>
                <div className="text-sm font-semibold text-white">Disponível na App Store</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 hover:bg-white/[0.07] transition-colors">
              <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <Smartphone className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">Em breve</div>
                <div className="text-sm font-semibold text-white">Disponível no Google Play</div>
              </div>
            </div>
          </Reveal>
        </div>
        <div className="max-w-7xl mx-auto px-5 pb-2">
          <Reveal direction="up">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] md:text-xs text-slate-300 text-center leading-snug">
              <span className="font-semibold text-white">Use como app:</span>{" "}
              <span className="md:hidden">
                iPhone (Safari): toque em Compartilhar → "Adicionar à Tela de Início".<br />
                Android (Chrome): menu ⋮ → "Adicionar à tela inicial".
              </span>
              <span className="hidden md:inline">
                iPhone/Safari: Compartilhar → "Adicionar à Tela de Início" · Android/Chrome: menu ⋮ → "Adicionar à tela inicial".
              </span>
            </div>
          </Reveal>
        </div>
        <Reveal direction="scale" duration={1100} className="max-w-7xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col items-center md:items-start gap-1">
            <img src={logo} alt="Phonee" className="h-16 md:h-20 w-auto drop-shadow-[0_8px_30px_rgba(59,130,246,0.35)]" />
            <div className="text-[10px] md:text-[11px] font-mono tracking-[0.35em] uppercase text-slate-400">
              Gestão inteligente
            </div>
          </div>
          <div className="text-xs">© {new Date().getFullYear()} Phonee. Todos os direitos reservados.</div>
        </Reveal>
      </footer>
    </div>
  );
}

/* ---------- feature block ---------- */

function FeatureBlock({ icon: Icon, eyebrow, title, text, items, reverse = false }: {
  icon: any; eyebrow: string; title: string; text: string; items: string[]; reverse?: boolean;
}) {
  return (
    <div className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
      <Reveal direction={reverse ? "right" : "left"} duration={1000}>
        <div className="inline-flex items-center gap-2 text-sm font-mono tracking-[0.3em] text-primary font-bold mb-4">
          <Icon className="h-5 w-5" /> {eyebrow}
        </div>
        <h3 className="text-3xl md:text-5xl font-extrabold tracking-tight">{title}</h3>
        <p className="mt-4 text-foreground/80 text-lg md:text-xl leading-relaxed font-semibold">{text}</p>
      </Reveal>
      <Reveal direction={reverse ? "left" : "right"} duration={1000} delay={120}>
        <Card className="p-6 md:p-8 border-2 border-border bg-card">
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
            {items.map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
          </ul>
        </Card>
      </Reveal>
    </div>
  );
}
