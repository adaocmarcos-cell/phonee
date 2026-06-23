import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import {
  LifeBuoy, Search, Send, MessageCircle, BookOpen, HelpCircle, CheckCircle2, Clock, AlertCircle,
  Bug, Lightbulb, Wrench,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TicketStatus = "aberto" | "pendente" | "resolvido";

type Ticket = {
  id: string;
  subject: string;
  category: string | null;
  priority: string | null;
  status: TicketStatus;
  message: string;
  created_at: string;
  updated_at: string;
};

type TicketMessage = {
  id: string;
  ticket_id: string;
  user_id: string;
  is_admin: boolean;
  message: string;
  created_at: string;
};

const HELP_TOPICS: { module: string; items: { q: string; a: string }[] }[] = [
  {
    module: "Estoque",
    items: [
      { q: "Como cadastrar um produto novo?", a: "Vá em Estoque → 'Novo produto'. Preencha nome, SKU, marca, categoria, preços e estoque atual/mínimo. Marque 'Visível no catálogo' se quiser exibir em tabela de preço." },
      { q: "Como funciona o estoque mínimo?", a: "Quando o estoque atual fica igual ou abaixo do mínimo, o produto entra automaticamente nas sugestões de Pedidos de Compra e gera alerta na Central de Alertas." },
      { q: "O que é o Relatório de Estoque em tempo real?", a: "Mostra o saldo de fechamento do mês anterior + entradas e saídas do período. Inconsistências (estoque negativo, divergências) aparecem destacadas em vermelho." },
      { q: "Como funcionam os Ajustes de Estoque?", a: "Dentro da página Estoque há o botão 'Ajustes'. Toda alteração manual exige justificativa (perda, brinde, uso interno, outros), é enviada ao gestor para aprovação e fica registrada nos Logs." },
      { q: "Como cadastrar marcas?", a: "Em Estoque, clique no ícone de marcas. Selecione as marcas com que sua loja trabalha — elas viram filtro automático nas Tabelas de Preço." },
    ],
  },
  {
    module: "Vendas",
    items: [
      { q: "Como registrar uma venda?", a: "Em Vendas → 'Nova venda'. Selecione cliente, itens, forma de pagamento e finalize. O estoque é baixado automaticamente." },
      { q: "O que é o Financeiro · A receber?", a: "Lista as vendas com pagamento pendente. Você pode marcar como pago, ver clientes em aberto e enviar lembrete via WhatsApp com prévia da mensagem antes de enviar." },
      { q: "Como funciona o lembrete por WhatsApp?", a: "Use o template padrão com {cliente}, {numero}, {valor}, {vencimento}, {loja}. Antes de enviar, a prévia mostra exatamente como o cliente vai receber a mensagem." },
    ],
  },
  {
    module: "Assistência & Ordens de Serviço",
    items: [
      { q: "Como cadastrar a senha do aparelho do cliente?", a: "Na OS, o campo 'Senha do aparelho' aceita senha numérica/texto OU padrão visual (3x3). O padrão mostra o início em verde, meio em amarelo e fim em vermelho com setas de direção." },
      { q: "Peças usadas em OS dão baixa no estoque?", a: "Sim. Peças aparecem como categoria em Estoque e sincronizam saídas tanto pela venda de peça quanto pelo uso em uma Ordem de Serviço." },
    ],
  },
  {
    module: "Curva ABC e Pedidos de Compra",
    items: [
      { q: "O que é a Curva ABC?", a: "Classifica seus produtos por giro: A (maior faturamento), B (médio), C (baixo). Use para focar compras nos itens que mais geram resultado." },
      { q: "Como funcionam as sugestões de compra?", a: "O sistema calcula a quantidade sugerida com base no histórico de vendas — você compra o que de fato gira, sem inflar o estoque. Em Pedidos de Compra, produtos abaixo do mínimo vêm pré-selecionados; você pode remover ou ajustar." },
    ],
  },
  {
    module: "Logs, Permissões e Alertas",
    items: [
      { q: "Onde vejo o histórico de ações dos usuários?", a: "No menu Logs (acima de Alertas). Filtre por usuário, tipo de ação e período. Acesso controlado por Permissões — o gestor define quem pode visualizar." },
      { q: "Como funcionam os alertas?", a: "A bolinha vermelha estilo notificação aparece no ícone de Alertas sempre que há algo crítico: estoque negativo, ajuste manual pendente de aprovação, etc." },
    ],
  },
  {
    module: "Tabelas de Preço e Marcas",
    items: [
      { q: "Como gerar uma tabela de preço?", a: "Em Tabelas de Preço, selecione marca/categoria, layout e exporte em PDF ou compartilhe link. Use as marcas pré-cadastradas em Estoque para filtrar." },
    ],
  },
];

const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Em aberto",
  pendente: "Pendente",
  resolvido: "Resolvido",
};

const STATUS_BADGE: Record<TicketStatus, string> = {
  aberto: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  pendente: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  resolvido: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const STATUS_ICON: Record<TicketStatus, any> = {
  aberto: AlertCircle,
  pendente: Clock,
  resolvido: CheckCircle2,
};

export default function Suporte() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");

  const [form, setForm] = useState({ subject: "", category: "duvida", priority: "normal", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("ajuda");

  const applyTemplate = (kind: "bug" | "ajuste" | "melhoria") => {
    const templates = {
      bug: {
        category: "bug",
        priority: "alta",
        subject: "[BUG] ",
        message:
          "Tela onde ocorre:\n\nO que aconteceu:\n\nO que era esperado:\n\nPassos para reproduzir:\n1.\n2.\n3.\n\nMensagem de erro (se houver):",
      },
      ajuste: {
        category: "sugestao",
        priority: "normal",
        subject: "[AJUSTE] ",
        message:
          "Funcionalidade a ajustar:\n\nComportamento atual:\n\nComo deveria funcionar:\n\nPor que esse ajuste ajudaria sua rotina:",
      },
      melhoria: {
        category: "sugestao",
        priority: "normal",
        subject: "[MELHORIA] ",
        message:
          "Melhoria sugerida:\n\nOnde no sistema:\n\nQual problema ela resolve:\n\nExemplo de uso:",
      },
    } as const;
    setForm({ ...templates[kind] });
    setTab("novo");
  };

  const loadTickets = async () => {
    if (!user) return;
    const { data } = await (supabase.from("support_tickets") as any)
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    setTickets((data as Ticket[]) ?? []);
  };

  useEffect(() => { loadTickets(); }, [user?.id]);

  const loadThread = async (ticketId: string) => {
    const { data } = await (supabase.from("support_ticket_messages") as any)
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setThread((data as TicketMessage[]) ?? []);
  };

  const submitTicket = async () => {
    if (!user) return;
    if (form.subject.trim().length < 3 || form.message.trim().length < 5) {
      toast({ title: "Preencha assunto e descrição", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase.from("support_tickets") as any).insert({
      user_id: user.id,
      subject: form.subject.trim().slice(0, 160),
      category: form.category,
      priority: form.priority,
      message: form.message.trim().slice(0, 4000),
      status: "aberto",
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Erro ao enviar chamado", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamado enviado", description: "Nossa equipe vai responder em breve." });
    setForm({ subject: "", category: "duvida", priority: "normal", message: "" });
    loadTickets();
  };

  const sendReply = async () => {
    if (!openTicket || !user || reply.trim().length < 2) return;
    const { error } = await (supabase.from("support_ticket_messages") as any).insert({
      ticket_id: openTicket.id,
      user_id: user.id,
      is_admin: false,
      message: reply.trim().slice(0, 4000),
    });
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    await (supabase.from("support_tickets") as any)
      .update({ status: "aberto", updated_at: new Date().toISOString() })
      .eq("id", openTicket.id);
    setReply("");
    loadThread(openTicket.id);
    loadTickets();
  };

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return HELP_TOPICS;
    return HELP_TOPICS.map((m) => ({
      ...m,
      items: m.items.filter((it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q) || m.module.toLowerCase().includes(q)),
    })).filter((m) => m.items.length > 0);
  }, [search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte"
        description="Tire dúvidas sobre o sistema, consulte a base de ajuda ou abra um chamado com nossa equipe."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ajuda"><BookOpen className="h-4 w-4 mr-2" />Central de ajuda</TabsTrigger>
          <TabsTrigger value="novo"><HelpCircle className="h-4 w-4 mr-2" />Abrir chamado</TabsTrigger>
          <TabsTrigger value="meus">
            <MessageCircle className="h-4 w-4 mr-2" />Meus chamados
            {tickets.length > 0 && <Badge className="ml-2 bg-primary/15 text-primary border-primary/30">{tickets.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ajuda" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar dúvida, módulo ou palavra-chave..."
                className="pl-9"
              />
            </div>
          </Card>

          {filteredTopics.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum tópico encontrado. Tente outra palavra ou abra um chamado.
            </Card>
          ) : (
            filteredTopics.map((module) => (
              <Card key={module.module} className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">{module.module}</h3>
                  <Badge variant="outline" className="ml-auto">{module.items.length}</Badge>
                </div>
                <Accordion type="single" collapsible>
                  {module.items.map((it, idx) => (
                    <AccordionItem key={idx} value={`${module.module}-${idx}`}>
                      <AccordionTrigger className="text-sm text-left">{it.q}</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{it.a}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="novo" className="mt-4">
          <div className="max-w-2xl space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => applyTemplate("bug")}
                className="text-left rounded-lg border border-border bg-card hover:bg-surface-elevated/40 hover:border-rose-500/40 transition p-4 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-8 w-8 rounded-md bg-rose-500/15 text-rose-600 flex items-center justify-center">
                    <Bug className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-sm">Reportar bug</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Algo travou, deu erro ou está se comportando diferente do esperado.
                </p>
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("ajuste")}
                className="text-left rounded-lg border border-border bg-card hover:bg-surface-elevated/40 hover:border-amber-500/40 transition p-4 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-8 w-8 rounded-md bg-amber-500/15 text-amber-600 flex items-center justify-center">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-sm">Pedir ajuste</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Funciona, mas precisa ser ajustado para a rotina da sua loja.
                </p>
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("melhoria")}
                className="text-left rounded-lg border border-border bg-card hover:bg-surface-elevated/40 hover:border-emerald-500/40 transition p-4 group"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="h-8 w-8 rounded-md bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
                    <Lightbulb className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-sm">Sugerir melhoria</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Tem uma ideia que pode deixar o sistema mais útil para você.
                </p>
              </button>
            </div>

            <Card className="p-6 space-y-4">
            <div>
              <Label>Assunto</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Resuma sua dúvida ou problema"
                maxLength={160}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duvida">Dúvida sobre uso</SelectItem>
                    <SelectItem value="bug">Bug ou erro</SelectItem>
                    <SelectItem value="sugestao">Sugestão / melhoria</SelectItem>
                    <SelectItem value="financeiro">Financeiro / assinatura</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Explique o que está acontecendo, em qual tela e os passos para reproduzir."
                rows={6}
                maxLength={4000}
              />
              <p className="text-xs text-muted-foreground mt-1">{form.message.length}/4000</p>
            </div>
            <Button onClick={submitTicket} disabled={submitting} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {submitting ? "Enviando..." : "Enviar chamado"}
            </Button>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="meus" className="mt-4 space-y-3">
          {tickets.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Você ainda não abriu nenhum chamado.
            </Card>
          ) : (
            tickets.map((t) => {
              const Icon = STATUS_ICON[t.status];
              return (
                <Card
                  key={t.id}
                  className="p-4 cursor-pointer hover:bg-surface-elevated/40 transition"
                  onClick={() => { setOpenTicket(t); loadThread(t.id); }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_BADGE[t.status]}>
                          <Icon className="h-3 w-3 mr-1" />
                          {STATUS_LABEL[t.status]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                      </div>
                      <h4 className="font-medium mt-1.5 truncate">{t.subject}</h4>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.message}</p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {new Date(t.updated_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!openTicket} onOpenChange={(o) => !o && setOpenTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {openTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge className={STATUS_BADGE[openTicket.status]}>{STATUS_LABEL[openTicket.status]}</Badge>
                  {openTicket.subject}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Card className="p-3 bg-surface-elevated/40">
                  <p className="text-xs text-muted-foreground mb-1">
                    Você · {new Date(openTicket.created_at).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{openTicket.message}</p>
                </Card>
                {thread.map((m) => (
                  <Card key={m.id} className={`p-3 ${m.is_admin ? "bg-primary/5 border-primary/30" : "bg-surface-elevated/40"}`}>
                    <p className="text-xs text-muted-foreground mb-1">
                      {m.is_admin ? "Suporte Mobile+" : "Você"} · {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                  </Card>
                ))}
                {openTicket.status !== "resolvido" && (
                  <div className="space-y-2 pt-2 border-t">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Adicionar resposta..."
                      rows={3}
                      maxLength={4000}
                    />
                    <Button onClick={sendReply} disabled={reply.trim().length < 2} size="sm">
                      <Send className="h-3.5 w-3.5 mr-1.5" />Enviar resposta
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}