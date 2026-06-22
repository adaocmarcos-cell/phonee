import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, TrendingUp, AlertTriangle, Users, Workflow, Building2,
  Boxes, Wrench, RefreshCw, Wallet, Check, X,
  ArrowRight, Lock, CheckCircle2, Star,
} from "lucide-react";
import logoAsset from "@/assets/mobileplus-logo.png.asset.json";
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

function DashStat({ label, value, sub, accent = "primary" }: {
  label: string; value: string; sub?: string; accent?: "primary" | "success" | "warning";
}) {
  const tone =
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
      <div className="text-[10px] font-mono tracking-widest text-slate-300 uppercase">{label}</div>
      <div className={`metric text-2xl md:text-3xl mt-1.5 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-300 mt-1">{sub}</div>}
    </div>
  );
}

/* ---------- page ---------- */

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV — preto sólido */}
      <header className="sticky top-0 z-50 bg-black border-b border-white/10">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <nav className="hidden md:flex items-center gap-8 text-base font-semibold text-white">
            <a href="#beneficios" className="hover:text-primary transition">Benefícios</a>
            <a href="#dashboard" className="hover:text-primary transition">Dashboard</a>
            <a href="#preco" className="hover:text-primary transition">Preço</a>
            <a href="#garantia" className="hover:text-primary transition">Garantia</a>
          </nav>
          <div className="flex items-center gap-2 ml-auto">
            <Link to="/auth">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10">
                Fazer login
              </Button>
            </Link>
            <a href="#preco">
              <Button className="bg-gradient-primary shadow-glow hidden sm:inline-flex">Comprar agora</Button>
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-[hsl(226_50%_15%)] text-white">
        <div className="absolute inset-0 opacity-[0.22] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.4) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[140px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 h-[420px] w-[420px] rounded-full bg-info/20 blur-[140px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-5 pt-4 pb-16 lg:pt-6 lg:pb-20">
          {/* LOGO PRINCIPAL — cores originais sobre painel branco */}
          <div className="flex justify-center mb-6 lg:mb-8">
            <div className="bg-white rounded-3xl px-10 py-4 md:px-16 md:py-6 shadow-2xl ring-1 ring-white/10">
              <img
                src={logo}
                alt="Mobile+"
                className="h-40 sm:h-56 md:h-72 lg:h-80 w-auto"
              />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge className="mb-6 bg-primary/20 text-white border-primary/40 hover:bg-primary/25 text-sm py-1.5 px-3">
              ERP especializado em smartphones e assistência
            </Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.02] tracking-tight">
              Mais controle. <br />
              <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">Menos erros.</span> Mais lucro.
            </h1>
            <p className="mt-6 text-xl text-slate-200 max-w-xl leading-relaxed font-medium">
              O sistema criado para lojas de smartphones, eletrônicos e assistência técnica
              que querem organizar a operação, automatizar processos e acompanhar seus números em tempo real.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#preco">
                <Button size="lg" className="bg-gradient-primary shadow-glow text-base h-12 px-7">
                  Comprar agora <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </a>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="text-base h-12 px-7 bg-white/5 text-white border-white/30 hover:bg-white/10 hover:text-white">
                  Fazer login
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-2 text-base text-white/90 font-semibold">
              <ShieldCheck className="h-5 w-5 text-success" />
              Garantia total de 7 dias · 100% do valor de volta
            </div>
          </div>

          {/* Offer card — ANUAL primeiro */}
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/40 to-info/30 blur-2xl rounded-3xl" />
            <Card className="relative p-7 md:p-9 bg-[hsl(224_25%_18%)] border-2 border-primary/40 text-white shadow-2xl">
              <div className="flex items-center justify-between mb-5">
                <Badge className="bg-success/20 text-success border-success/40 text-sm">
                  <Star className="h-3.5 w-3.5 mr-1" /> MAIS ESCOLHIDO
                </Badge>
                <div className="text-[10px] font-mono tracking-widest text-slate-300">PLANO ANUAL</div>
              </div>
              <div className="text-success font-bold text-base uppercase tracking-wide">SEM MENSALIDADES</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="metric text-5xl md:text-6xl">R$ 127</span>
                <span className="text-base text-slate-300 ml-1">/ano à vista</span>
              </div>
              <div className="mt-1 text-lg text-white font-semibold">ou parcelado no cartão</div>

              <div className="my-5 flex items-center gap-3 text-slate-300 text-xs">
                <div className="h-px flex-1 bg-white/10" /> OU <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                <div className="text-xs font-mono tracking-widest text-primary font-bold">RECOMENDADO · PLANO VITALÍCIO</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="metric text-3xl">R$ 197</span>
                  <span className="text-sm text-slate-300 ml-1">pagamento único</span>
                </div>
                <div className="text-xs text-slate-200 mt-1">
                  Pague uma vez e use para sempre — sem renovação, com prioridade no suporte e acesso antecipado a novos módulos.
                </div>
              </div>

              <ul className="mt-5 space-y-2.5 text-base text-white font-medium">
                <CheckItem>Sem mensalidade</CheckItem>
                <CheckItem>Sem cobrança recorrente</CheckItem>
                <CheckItem>Atualizações incluídas</CheckItem>
              </ul>
              <a href="#preco" className="block mt-7">
                <Button size="lg" className="w-full bg-gradient-primary shadow-glow h-12 text-base">
                  Quero garantir agora
                </Button>
              </a>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-300">
                <Lock className="h-3 w-3" /> Pagamento 100% seguro
              </div>
            </Card>
          </div>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section id="beneficios" className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-5">
          <SectionTitle
            eyebrow="POR QUE MOBILE+"
            title="O que o Mobile+ faz pela sua loja?"
            subtitle="Desenvolvido para eliminar processos manuais, reduzir falhas operacionais e entregar informações estratégicas para decisões mais rápidas e inteligentes."
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            <BenefitCard icon={ShieldCheck} title="Reduz erros operacionais" desc="Menos retrabalho, menos esquecimentos e mais padronização do começo ao fim do processo." />
            <BenefitCard icon={TrendingUp} title="Maximiza o lucro" desc="Saiba exatamente quais produtos dão mais retorno e onde está sua margem real." />
            <BenefitCard icon={AlertTriangle} title="Evita falta de estoque" desc="Receba alertas e acompanhe movimentações em tempo real." />
            <BenefitCard icon={Users} title="Diminui dependência de funcionários" desc="A informação fica registrada no sistema — não na cabeça das pessoas." />
            <BenefitCard icon={Workflow} title="Automatiza a operação" desc="Vendas, estoque, assistência técnica e finanças em um único ambiente." />
            <BenefitCard icon={Building2} title="Escale para múltiplas lojas" desc="Gerencie uma ou várias unidades com a mesma facilidade e visão consolidada." />
          </div>
        </div>
      </section>

      {/* PAIN SECTION */}
      <section className="py-20 md:py-28 bg-[hsl(0_0%_98%)]">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle
            eyebrow="DORES COMUNS"
            title="Sua loja sofre com algum destes problemas?"
          />
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-4 max-w-4xl mx-auto">
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
          </div>
          <p className="text-center mt-12 text-xl md:text-2xl font-bold">
            O Mobile+ foi criado exatamente para resolver esses problemas.
          </p>
        </div>
      </section>

      {/* DASHBOARD MOCKUP */}
      <section id="dashboard" className="relative py-20 md:py-28 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-7xl mx-auto px-5">
          <div className="max-w-4xl mx-auto text-center mb-14">
            <div className="text-sm md:text-base font-mono tracking-[0.3em] mb-4 text-primary font-bold">
              EM TEMPO REAL
            </div>
            <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
              Seus números mais importantes em segundos
            </h2>
            <p className="mt-6 text-xl md:text-2xl text-white/90 font-semibold">
              Mesmo em dias corridos você sabe exatamente como está sua operação.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[hsl(224_25%_18%)] shadow-2xl p-5 md:p-7">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10 mb-5">
              <div className="h-2.5 w-2.5 rounded-full bg-danger" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning" />
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <div className="ml-3 text-xs font-mono text-slate-300">mobile+ / dashboard</div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <DashStat label="Faturamento do dia"  value="R$ 12.847" sub="+18% vs ontem"   accent="success" />
              <DashStat label="Faturamento do mês"  value="R$ 284.560" sub="Meta 92%"        accent="primary" />
              <DashStat label="Lucro do período"    value="R$ 86.120"  sub="Margem real"    accent="success" />
              <DashStat label="Margem média"        value="32,4%"      sub="Curva A"        accent="primary" />
              <DashStat label="Estoque encalhado"   value="R$ 18.300"  sub="47 itens"       accent="warning" />
              <DashStat label="Mais vendidos"       value="iPhone 13"  sub="32 unid · mês"  accent="primary" />
              <DashStat label="Mais lucrativos"     value="Película"   sub="61% margem"     accent="success" />
              <DashStat label="OS abertas"          value="14"         sub="3 atrasadas"    accent="warning" />
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
          </div>
        </div>
      </section>

      {/* FEATURE GRID */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-5 space-y-20">

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
            ].map((x) => (
              <Card key={x.c} className="p-7 text-center border-2 border-border">
                <div className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center text-3xl font-bold
                  ${x.tone === "success" ? "bg-success/10 text-success" :
                    x.tone === "primary" ? "bg-primary/10 text-primary" :
                    "bg-warning/10 text-warning"}`}>
                  {x.c}
                </div>
                <h3 className="mt-4 font-extrabold text-xl">{x.t}</h3>
                <p className="mt-2 text-base text-foreground/80 font-medium">{x.d}</p>
              </Card>
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
            <Card className="p-7 border-2 border-danger/40 bg-danger/[0.04]">
              <h3 className="font-extrabold text-2xl mb-5 flex items-center gap-2 text-danger">
                <X className="h-7 w-7" strokeWidth={3.5} /> SEM MOBILE+
              </h3>
              <ul className="space-y-3.5">
                {["Planilhas", "Informações espalhadas", "Processos manuais", "Dependência de funcionários",
                  "Erros frequentes", "Estoque desorganizado", "Falta de indicadores", "Menos lucro"
                ].map((i) => <CheckItem key={i} negative big>{i}</CheckItem>)}
              </ul>
            </Card>
            <Card className="p-7 border-2 border-success/50 bg-success/[0.05] shadow-glow">
              <h3 className="font-extrabold text-2xl mb-5 flex items-center gap-2 text-success">
                <CheckCircle2 className="h-7 w-7" /> COM MOBILE+
              </h3>
              <ul className="space-y-3.5">
                {["Operação centralizada", "Controle profissional", "Dados organizados", "Menos erros",
                  "Mais produtividade", "Estoque inteligente", "Gestão simplificada", "Mais lucro"
                ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* GARANTIA */}
      <section id="garantia" className="relative py-20 md:py-28 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[420px] w-[420px] rounded-full bg-success/20 blur-[140px]" />
        <div className="relative max-w-3xl mx-auto px-5 text-center">
          <div className="mx-auto h-24 w-24 rounded-3xl bg-success/15 border border-success/40 flex items-center justify-center shadow-2xl">
            <ShieldCheck className="h-12 w-12 text-success" />
          </div>
          <div className="mt-6 text-sm font-mono tracking-[0.3em] text-success font-bold">GARANTIA PREMIUM</div>
          <h2 className="mt-3 text-4xl md:text-6xl font-extrabold tracking-tight text-white">7 dias para testar sem risco</h2>
          <p className="mt-6 text-white/90 text-lg md:text-xl leading-relaxed font-medium">
            Experimente o Mobile+ com tranquilidade. Se nos primeiros 7 dias você concluir que o sistema
            não atende sua necessidade, devolvemos <span className="text-white font-bold">100% do valor</span> investido.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-base text-white font-semibold">
            <span className="flex items-center gap-2"><Check className="h-5 w-5 text-success" strokeWidth={3} /> Sem burocracia</span>
            <span className="flex items-center gap-2"><Check className="h-5 w-5 text-success" strokeWidth={3} /> Sem complicações</span>
            <span className="flex items-center gap-2"><Check className="h-5 w-5 text-success" strokeWidth={3} /> Sem risco</span>
          </div>
        </div>
      </section>

      {/* PREÇO — Anual primeiro */}
      <section id="preco" className="py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle
            eyebrow="PREÇO"
            title="Sem mensalidades. Sem surpresas."
            subtitle="Escolha o plano que faz mais sentido para sua loja."
          />

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Anual — destaque */}
            <div className="relative">
              <div className="absolute -inset-2 bg-gradient-to-br from-primary/40 to-info/25 blur-2xl rounded-3xl" />
              <Card className="relative p-8 md:p-10 border-2 border-border bg-card h-full">
                <Badge className="bg-success/15 text-success border-success/40 text-sm">
                  PLANO ANUAL
                </Badge>
                <div className="mt-4 text-base font-bold uppercase tracking-wide text-success">
                  Sem mensalidades
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="metric text-6xl md:text-7xl text-primary">R$ 127</span>
                </div>
                <div className="mt-1 text-xl font-extrabold">por ano à vista</div>
                <div className="mt-1 text-lg font-semibold text-foreground/80">ou parcelado no cartão</div>

                <ul className="mt-6 space-y-3">
                  {[
                    "Sem mensalidade",
                    "Sem cobrança recorrente",
                    "Atualizações incluídas",
                    "Suporte dedicado",
                    "Garantia de 7 dias",
                  ].map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
                </ul>

                <a href="#" className="block mt-7">
                  <Button size="lg" variant="outline" className="w-full h-12 text-base border-2 border-primary text-primary hover:bg-primary hover:text-white">
                    Assinar Plano Anual <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </a>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-foreground/70">
                  <Lock className="h-3 w-3" /> Pagamento 100% seguro · Acesso imediato
                </div>
              </Card>
            </div>

            {/* Vitalício — destaque máximo */}
            <div className="relative">
              <div className="absolute -inset-2 bg-gradient-to-br from-primary/50 to-info/30 blur-2xl rounded-3xl" />
              <Card className="relative p-8 md:p-10 border-2 border-primary bg-card h-full shadow-glow">
                <Badge className="bg-primary/15 text-primary border-primary/40 text-sm">
                  <Star className="h-3.5 w-3.5 mr-1" /> RECOMENDADO · MELHOR CUSTO-BENEFÍCIO
                </Badge>
                <div className="mt-4 text-base font-bold uppercase tracking-wide text-primary">
                  Plano Vitalício · Pagamento único
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="metric text-6xl md:text-7xl text-primary">R$ 197</span>
                </div>
                <div className="mt-1 text-xl font-extrabold">pague uma vez, use para sempre</div>
                <div className="mt-1 text-lg font-semibold text-foreground/80">
                  Em menos de 2 anos já se paga frente ao anual — depois disso, é 100% economia.
                </div>

                <ul className="mt-6 space-y-3">
                  {[
                    "Acesso vitalício ao sistema",
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

                <a href="#" className="block mt-7">
                  <Button size="lg" className="w-full bg-gradient-primary shadow-glow h-12 text-base">
                    Quero o Plano Vitalício <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </a>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-foreground/70">
                  <Lock className="h-3 w-3" /> Pagamento 100% seguro · Acesso imediato
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative py-24 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight">
            Menos tempo organizando a loja. <br />
            <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">Mais tempo vendendo.</span>
          </h2>
          <p className="mt-6 text-xl text-white/90 font-medium">
            Automatize processos, reduza erros, acompanhe seus números diariamente
            e tenha mais liberdade para crescer.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#preco">
              <Button size="lg" className="bg-gradient-primary shadow-glow h-12 px-7 text-base">
                Comprar agora <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </a>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="h-12 px-7 text-base bg-white/5 text-white border-white/30 hover:bg-white/10 hover:text-white">
                Fazer login
              </Button>
            </Link>
          </div>

          <blockquote className="mt-16 max-w-3xl mx-auto text-xl md:text-2xl italic text-white leading-relaxed font-medium">
            "Quem controla seus números toma decisões melhores. Quem toma decisões melhores
            <span className="text-primary not-italic font-bold"> vende mais, erra menos e cresce com mais segurança.</span>"
          </blockquote>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-black text-slate-300 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={logo} alt="Mobile+" className="h-10 w-auto invert" />
          <div className="text-xs">© {new Date().getFullYear()} Mobile+. Todos os direitos reservados.</div>
        </div>
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
      <div>
        <div className="inline-flex items-center gap-2 text-sm font-mono tracking-[0.3em] text-primary font-bold mb-4">
          <Icon className="h-5 w-5" /> {eyebrow}
        </div>
        <h3 className="text-3xl md:text-5xl font-extrabold tracking-tight">{title}</h3>
        <p className="mt-4 text-foreground/80 text-lg md:text-xl leading-relaxed font-semibold">{text}</p>
      </div>
      <Card className="p-6 md:p-8 border-2 border-border bg-card">
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
          {items.map((i) => <CheckItem key={i} big>{i}</CheckItem>)}
        </ul>
      </Card>
    </div>
  );
}
