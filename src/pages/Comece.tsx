import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import {
  Boxes, AlertTriangle, RefreshCw, ShoppingCart, Smartphone,
  Star, ShieldCheck, CheckCircle2, ChevronDown,
} from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";
import { Button } from "@/components/ui/button";
import { WhatsappCTA } from "@/components/marketing/WhatsappCTA";
import { LeadForm } from "@/components/marketing/LeadForm";
import { SHOW_WHATSAPP } from "@/config/marketing";
import { captureUtms } from "@/lib/utmTracking";
import { trackPageVisit } from "@/lib/trackVisit";
import { trackMetaEvent } from "@/lib/metaPixel";

const pains = [
  {
    icon: Boxes,
    title: "Estoque perdido no caderno",
    text:
      "Sem saber o que vende, o que encalha e o que precisa repor. O Phonee mostra tudo em tempo real, com alertas quando o estoque tá baixo.",
  },
  {
    icon: Smartphone,
    title: "Controle de aparelhos seminovos",
    text:
      "Registre compra, troca e revenda com margem, IMEI e histórico do aparelho. Você para de perder dinheiro em negociação de usados.",
  },
  {
    icon: ShoppingCart,
    title: "Pedido de reposição rápido",
    text:
      "O sistema sugere o que comprar com base na saída real da sua loja — capa, película, fonte, cabo. Chega de comprar no achismo.",
  },
  {
    icon: AlertTriangle,
    title: "Fim das vendas fiado esquecidas",
    text:
      "Cadastre clientes, controle fiado e cobrança. Cada venda vira histórico — e cada real vira relatório de fim de mês.",
  },
];

const faq = [
  {
    q: "Quanto custa?",
    a: "Você começa com um teste grátis. Depois, o plano é acessível para loja de bairro — a partir de valores compatíveis com quem tá começando no interior.",
  },
  {
    q: "Precisa de computador?",
    a: "Não. O Phonee roda no celular, tablet ou computador — tudo pela internet, sem instalar nada.",
  },
  {
    q: "É difícil de usar?",
    a: "Foi feito pensando em quem nunca mexeu com sistema. Cadastro de produto, venda e cliente em poucos toques. E a gente te ajuda no WhatsApp para configurar tudo.",
  },
  {
    q: "Funciona no celular?",
    a: "Sim, 100%. Faz venda, consulta estoque e vê o financeiro da sua loja de qualquer lugar, direto do celular.",
  },
];

export default function Comece() {
  useEffect(() => {
    captureUtms();
    trackPageVisit("/comece");
    trackMetaEvent("ViewContent", { custom: { page: "comece" } });
    document.title = "Comece agora — Phonee, o sistema pra loja de celular";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        "Controle estoque, vendas e aparelhos usados da sua loja de celular direto do celular. Teste grátis o Phonee.",
      );
    }
  }, []);

  const scrollToForm = () => {
    const el = document.getElementById("formulario");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar minimal — só logo */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="Phonee">
            <img
              src={logoAsset.url}
              alt="Phonee"
              className="h-8 w-auto object-contain"
              draggable={false}
            />
          </Link>
          <span className="hidden text-xs font-mono uppercase tracking-widest text-muted-foreground sm:inline">
            Sistema para loja de celular
          </span>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:py-14 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center">
            <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Feito para o interior de MG
            </span>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl">
              Sua loja de celular ainda controla o estoque no caderno?
            </h1>
            <p className="mt-4 text-lg text-foreground/80 md:text-xl">
              Chega de perder venda por não achar a capa, o cabo ou o aparelho.
              Controle estoque, vendas e aparelhos usados em um só sistema —
              direto do celular.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={scrollToForm}>
                Quero testar grátis
              </Button>
              {SHOW_WHATSAPP && (
                <WhatsappCTA
                  size="lg"
                  className="flex-1"
                  label="Falar no WhatsApp"
                />
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Sem cartão de crédito. Cancelamento em 1 clique.
            </p>
          </div>

          {/* Form em destaque no hero (desktop) */}
          <div id="formulario" className="scroll-mt-24">
            <Card className="border-2 border-primary/40 p-5 shadow-glow">
              <h2 className="text-xl font-extrabold">
                Comece o teste grátis em 20 segundos
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Preencha e nossa equipe entra em contato para montar o
                teste na sua loja.
              </p>
              <LeadForm origem_pagina="/comece#hero" />
            </Card>
          </div>
        </div>
      </section>

      {/* DORES E SOLUÇÕES */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-xs font-mono uppercase tracking-widest text-primary">
            O que o Phonee resolve
          </span>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
            Feito pra loja pequena de cidade do interior
          </h2>
          <p className="mt-3 text-foreground/70">
            Cada tela foi pensada pra dono que faz venda, atende cliente e ainda
            fecha o caixa no fim do dia. Sem enrolação, sem menu enorme.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {pains.map((p) => (
            <Card
              key={p.title}
              className="flex gap-4 border-2 border-border p-5 transition-colors hover:border-primary"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-primary/40 bg-primary/15">
                <p.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold">{p.title}</h3>
                <p className="mt-1 text-sm text-foreground/80">{p.text}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* PROVA SOCIAL */}
      <section className="bg-muted/40 py-14">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <span className="text-xs font-mono uppercase tracking-widest text-primary">
              Confiança
            </span>
            <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
              Donos de loja como você já usam
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                nome: "Rafael — Sete Lagoas/MG",
                fala:
                  "Antes eu perdia venda de capa e película porque não sabia o que tinha. Hoje o Phonee me avisa e eu já compro certo.",
              },
              {
                nome: "Carla — Divinópolis/MG",
                fala:
                  "Compra de aparelho usado ficou fácil. Cadastro o IMEI, defino a margem e revendo sem enrolação.",
              },
              {
                nome: "Junior — Pará de Minas/MG",
                fala:
                  "Trabalho no balcão só com o celular. Faço venda, olho estoque e ainda vejo o financeiro no fim do dia.",
              },
            ].map((d) => (
              <Card key={d.nome} className="p-5">
                <div className="mb-2 flex items-center gap-1 text-warning">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="text-sm italic text-foreground/85">"{d.fala}"</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {d.nome}
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" /> Dados protegidos e criptografados
            </div>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-success" /> Atualizações contínuas
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> Suporte no WhatsApp
            </div>
          </div>
        </div>
      </section>

      {/* OFERTA */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/15 to-transparent p-6 sm:p-10">
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-center">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-primary">
                Teste grátis
              </span>
              <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">
                Testa 7 dias por conta da casa
              </h2>
              <ul className="mt-4 space-y-2 text-foreground/85">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  Sem cartão de crédito
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  Configuração feita junto com você no WhatsApp
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  Se não gostar, é só parar de usar
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={scrollToForm}>
                Quero testar grátis
              </Button>
              {SHOW_WHATSAPP && (
                <WhatsappCTA size="lg" label="Falar no WhatsApp" />
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        <div className="mb-6 text-center">
          <span className="text-xs font-mono uppercase tracking-widest text-primary">
            Dúvidas comuns
          </span>
          <h2 className="mt-2 text-3xl font-extrabold">Perguntas frequentes</h2>
        </div>
        <div className="space-y-3">
          {faq.map((f) => (
            <Collapsible
              key={f.q}
              className="rounded-lg border-2 border-border bg-card px-4"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 py-4 text-left font-semibold">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pb-4 text-sm text-foreground/80">
                {f.a}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </section>

      {/* CTA fixo mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 shadow-[0_-4px_18px_rgba(0,0,0,0.12)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-5xl gap-2">
          <Button size="lg" className="flex-1" onClick={scrollToForm}>
            Quero testar grátis
          </Button>
          {SHOW_WHATSAPP && (
            <WhatsappCTA size="lg" className="flex-1" label="WhatsApp" />
          )}
        </div>
      </div>
      <div className="h-20 md:hidden" aria-hidden />

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Phonee — Sistema para loja de celular e acessórios.
      </footer>
    </div>
  );
}