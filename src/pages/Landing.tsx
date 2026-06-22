import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, TrendingUp, AlertTriangle, Users, Workflow, Building2,
  BarChart3, Boxes, Wrench, RefreshCw, Wallet, LineChart, Check, X,
  ArrowRight, Sparkles, Zap, Lock, CheckCircle2,
} from "lucide-react";
import logo from "@/assets/mobileplus-icon.png";

/* ---------- small building blocks ---------- */

function SectionTitle({ eyebrow, title, subtitle, light = false }: {
  eyebrow?: string; title: string; subtitle?: string; light?: boolean;
}) {
  return (
    <div className="max-w-3xl mx-auto text-center mb-14">
      {eyebrow && (
        <div className={`text-[11px] font-mono tracking-[0.3em] mb-4 ${light ? "text-primary" : "text-primary"}`}>
          {eyebrow}
        </div>
      )}
      <h2 className={`text-3xl md:text-5xl font-bold tracking-tight ${light ? "text-white" : ""}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-5 text-base md:text-lg ${light ? "text-slate-300" : "text-muted-foreground"}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function BenefitCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <Card className="p-6 bg-card border-border hover:border-primary/50 transition-all hover:shadow-glow group">
      <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </Card>
  );
}

function CheckItem({ children, negative = false }: { children: React.ReactNode; negative?: boolean }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      {negative ? (
        <X className="h-5 w-5 text-danger shrink-0 mt-0.5" />
      ) : (
        <Check className="h-5 w-5 text-success shrink-0 mt-0.5" />
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
      <div className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">{label}</div>
      <div className={`metric text-2xl md:text-3xl mt-1.5 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

/* ---------- page ---------- */

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[hsl(226_50%_15%)]/85 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="Mobile+" className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-white font-bold tracking-tight">Mobile<span className="text-primary">+</span></div>
              <div className="text-[9px] font-mono text-slate-400 tracking-[0.25em]">ERP · SMARTPHONES</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-slate-300">
            <a href="#beneficios" className="hover:text-white transition">Benefícios</a>
            <a href="#dashboard" className="hover:text-white transition">Dashboard</a>
            <a href="#preco" className="hover:text-white transition">Preço</a>
            <a href="#garantia" className="hover:text-white transition">Garantia</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" className="text-slate-200 hover:text-white hover:bg-white/10">
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
        <div className="absolute inset-0 opacity-[0.25] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.4) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div className="absolute -top-40 -right-40 h-[480px] w-[480px] rounded-full bg-primary/30 blur-[140px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 h-[420px] w-[420px] rounded-full bg-info/20 blur-[140px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-5 pt-20 pb-24 lg:pt-28 lg:pb-32 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Badge className="mb-6 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
              <Sparkles className="h-3 w-3 mr-1.5" /> ERP especializado em smartphones e assistência
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold leading-[1.05] tracking-tight">
              Mais controle. <br />
              <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">Menos erros.</span> Mais lucro.
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-xl leading-relaxed">
              O sistema criado especificamente para lojas de smartphones, eletrônicos e assistência técnica
              que desejam organizar a operação, automatizar processos e acompanhar seus números em tempo real.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#preco">
                <Button size="lg" className="bg-gradient-primary shadow-glow text-base h-12 px-7">
                  Comprar agora <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </a>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="text-base h-12 px-7 bg-white/5 text-white border-white/20 hover:bg-white/10 hover:text-white">
                  Fazer login
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
              <ShieldCheck className="h-4 w-4 text-success" />
              Garantia total de 7 dias · 100% do valor de volta
            </div>
          </div>

          {/* Offer card */}
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-br from-primary/40 to-info/30 blur-2xl rounded-3xl" />
            <Card className="relative p-7 md:p-9 bg-[hsl(224_25%_18%)] border-white/10 text-white shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <Badge className="bg-success/15 text-success border-success/30">Oferta de lançamento</Badge>
                <div className="text-[10px] font-mono tracking-widest text-slate-400">VITALÍCIO</div>
              </div>
              <div className="text-slate-400 line-through text-sm">De R$ 497,00 por apenas</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="metric text-5xl md:text-6xl">R$ 297</span>
                <span className="text-2xl text-slate-300">,00</span>
              </div>
              <div className="text-primary font-semibold text-lg">Pagamento único · Vitalício</div>
              <div className="my-5 flex items-center gap-3 text-slate-400 text-xs">
                <div className="h-px flex-1 bg-white/10" /> OU <div className="h-px flex-1 bg-white/10" />
              </div>
              <div className="text-lg font-semibold">Plano Anual disponível</div>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-200">
                <CheckItem>Sem mensalidades</CheckItem>
                <CheckItem>Sem cobranças recorrentes</CheckItem>
                <CheckItem>Sem surpresas no cartão</CheckItem>
                <CheckItem>Atualizações incluídas</CheckItem>
              </ul>
              <a href="#preco" className="block mt-7">
                <Button size="lg" className="w-full bg-gradient-primary shadow-glow h-12 text-base">
                  Quero garantir agora
                </Button>
              </a>
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                <Lock className="h-3 w-3" /> Pagamento 100% seguro
              </div>
            </Card>
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
            <BenefitCard icon={AlertTriangle} title="Evita falta de estoque" desc="Receba alertas inteligentes e acompanhe movimentações em tempo real." />
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
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-3 max-w-4xl mx-auto">
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
              <CheckItem key={p} negative>{p}</CheckItem>
            ))}
          </div>
          <p className="text-center mt-12 text-lg font-semibold">
            O Mobile+ foi criado exatamente para resolver esses problemas.
          </p>
        </div>
      </section>

      {/* DASHBOARD MOCKUP */}
      <section id="dashboard" className="relative py-20 md:py-28 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-7xl mx-auto px-5">
          <SectionTitle
            light
            eyebrow="EM TEMPO REAL"
            title="Seus números mais importantes em segundos"
            subtitle="Mesmo em dias corridos você sabe exatamente como está sua operação."
          />

          <div className="rounded-2xl border border-white/10 bg-[hsl(224_25%_18%)] shadow-2xl p-5 md:p-7">
            <div className="flex items-center gap-2 pb-4 border-b border-white/10 mb-5">
              <div className="h-2.5 w-2.5 rounded-full bg-danger" />
              <div className="h-2.5 w-2.5 rounded-full bg-warning" />
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <div className="ml-3 text-xs font-mono text-slate-400">mobile+ / dashboard</div>
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
              <div className="mt-3 text-xs text-slate-400 font-mono">Vendas dos últimos 13 dias</div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE GRID — Estoque + OS + Trade-in + Despesas */}
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
              <Card key={x.c} className="p-7 text-center border-border">
                <div className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center text-3xl font-bold
                  ${x.tone === "success" ? "bg-success/10 text-success" :
                    x.tone === "primary" ? "bg-primary/10 text-primary" :
                    "bg-warning/10 text-warning"}`}>
                  {x.c}
                </div>
                <h3 className="mt-4 font-semibold text-lg">{x.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{x.d}</p>
              </Card>
            ))}
          </div>
          <p className="text-center mt-10 text-lg font-semibold">
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-3 max-w-4xl mx-auto">
            {[
              "Controle de múltiplas lojas", "Estoque por unidade", "Relatórios individuais",
              "Relatórios consolidados", "Usuários por loja", "Permissões por função",
              "Histórico completo",
            ].map((i) => <CheckItem key={i}>{i}</CheckItem>)}
          </div>
        </div>
      </section>

      {/* COMPARATIVO */}
      <section className="py-20 md:py-28 bg-[hsl(0_0%_98%)]">
        <div className="max-w-6xl mx-auto px-5">
          <SectionTitle eyebrow="ANTES × DEPOIS" title="A diferença é clara" />
          <div className="grid md:grid-cols-2 gap-5">
            <Card className="p-7 border-danger/30 bg-danger/[0.03]">
              <h3 className="font-bold text-xl mb-5 flex items-center gap-2 text-danger">
                <X className="h-5 w-5" /> SEM MOBILE+
              </h3>
              <ul className="space-y-3">
                {["Planilhas", "Informações espalhadas", "Processos manuais", "Dependência de funcionários",
                  "Erros frequentes", "Estoque desorganizado", "Falta de indicadores", "Menos lucro"
                ].map((i) => <CheckItem key={i} negative>{i}</CheckItem>)}
              </ul>
            </Card>
            <Card className="p-7 border-success/40 bg-success/[0.04] shadow-glow">
              <h3 className="font-bold text-xl mb-5 flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" /> COM MOBILE+
              </h3>
              <ul className="space-y-3">
                {["Operação centralizada", "Controle profissional", "Dados organizados", "Menos erros",
                  "Mais produtividade", "Estoque inteligente", "Gestão simplificada", "Mais lucro"
                ].map((i) => <CheckItem key={i}>{i}</CheckItem>)}
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
          <div className="mt-6 text-[11px] font-mono tracking-[0.3em] text-success">GARANTIA PREMIUM</div>
          <h2 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight">7 dias para testar sem risco</h2>
          <p className="mt-6 text-slate-300 text-lg leading-relaxed">
            Experimente o Mobile+ com tranquilidade. Se nos primeiros 7 dias você concluir que o sistema
            não atende sua necessidade, devolvemos <span className="text-white font-semibold">100% do valor</span> investido.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-slate-300">
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Sem burocracia</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Sem complicações</span>
            <span className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> Sem risco</span>
          </div>
        </div>
      </section>

      {/* PREÇO */}
      <section id="preco" className="py-20 md:py-28 bg-background">
        <div className="max-w-5xl mx-auto px-5">
          <SectionTitle
            eyebrow="PREÇO"
            title="Invista uma vez. Utilize por anos."
            subtitle="Sem mensalidades. Sem pegadinhas. Decisão simples."
          />
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-br from-primary/30 to-info/20 blur-2xl rounded-3xl" />
            <Card className="relative p-8 md:p-12 border-primary/30 bg-card">
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div>
                  <Badge className="bg-primary/15 text-primary border-primary/30">Mais escolhido</Badge>
                  <div className="mt-4 text-muted-foreground line-through">De R$ 497,00 por</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="metric text-6xl md:text-7xl text-primary">R$ 297</span>
                    <span className="text-2xl text-muted-foreground">,00</span>
                  </div>
                  <div className="mt-1 text-xl font-semibold">Pagamento único · Vitalício</div>
                  <div className="my-5 flex items-center gap-3 text-muted-foreground text-xs">
                    <div className="h-px flex-1 bg-border" /> OU <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="text-lg font-semibold">Plano Anual disponível</div>
                  <a href="#" className="block mt-6">
                    <Button size="lg" className="w-full bg-gradient-primary shadow-glow h-13 text-base">
                      Comprar agora <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </a>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" /> Pagamento 100% seguro · Acesso imediato
                  </div>
                </div>
                <ul className="space-y-3.5">
                  {[
                    "Sem mensalidade",
                    "Sem cobrança recorrente",
                    "Atualizações incluídas",
                    "Sistema especializado",
                    "Implantação rápida",
                    "Suporte dedicado",
                    "Garantia de 7 dias",
                  ].map((i) => <CheckItem key={i}>{i}</CheckItem>)}
                </ul>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative py-24 bg-[hsl(226_50%_15%)] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
             style={{ backgroundImage: "radial-gradient(hsl(200 100% 49% / 0.5) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-5 text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
            Menos tempo organizando a loja. <br />
            <span className="bg-gradient-to-r from-primary to-info bg-clip-text text-transparent">Mais tempo vendendo.</span>
          </h2>
          <p className="mt-6 text-lg text-slate-300">
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
              <Button size="lg" variant="outline" className="h-12 px-7 text-base bg-white/5 text-white border-white/20 hover:bg-white/10 hover:text-white">
                Fazer login
              </Button>
            </Link>
          </div>

          <blockquote className="mt-16 max-w-3xl mx-auto text-lg md:text-xl italic text-slate-200 leading-relaxed">
            "Quem controla seus números toma decisões melhores. Quem toma decisões melhores
            <span className="text-primary not-italic font-semibold"> vende mais, erra menos e cresce com mais segurança.</span>"
          </blockquote>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[hsl(226_50%_12%)] text-slate-400 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="Mobile+" className="h-7 w-7" />
            <div className="text-white font-semibold">Mobile<span className="text-primary">+</span></div>
            <span className="text-[10px] font-mono tracking-widest ml-1">ERP · SMARTPHONES</span>
          </div>
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
        <div className="inline-flex items-center gap-2 text-[11px] font-mono tracking-[0.3em] text-primary mb-4">
          <Icon className="h-4 w-4" /> {eyebrow}
        </div>
        <h3 className="text-2xl md:text-4xl font-bold tracking-tight">{title}</h3>
        <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">{text}</p>
      </div>
      <Card className="p-6 md:p-8 border-border bg-card">
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {items.map((i) => <CheckItem key={i}>{i}</CheckItem>)}
        </ul>
      </Card>
    </div>
  );
}