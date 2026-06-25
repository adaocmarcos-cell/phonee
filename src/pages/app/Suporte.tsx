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
  Bug, Lightbulb, Wrench, History, UserCheck, Loader2, Lock, Sparkles, Paperclip, X, FileText, Image as ImageIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TicketStatus = "aberto" | "em_andamento" | "aguardando_cliente" | "pendente" | "resolvido" | "fechado";

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

type StatusHistoryRow = {
  id: string;
  ticket_id: string;
  from_status: TicketStatus | null;
  to_status: TicketStatus;
  changed_by_is_admin: boolean;
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
  aberto: "Novo",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando você",
  pendente: "Pendente",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

const STATUS_BADGE: Record<TicketStatus, string> = {
  aberto: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  em_andamento: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  aguardando_cliente: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  pendente: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  resolvido: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  fechado: "bg-muted text-muted-foreground border-border",
};

const STATUS_ICON: Record<TicketStatus, any> = {
  aberto: AlertCircle,
  em_andamento: Loader2,
  aguardando_cliente: UserCheck,
  pendente: Clock,
  resolvido: CheckCircle2,
  fechado: Lock,
};

export default function Suporte() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);

  const [form, setForm] = useState({ subject: "", category: "duvida", priority: "normal", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("ajuda");

  // Sugestões & Bugs quick dialog
  const [sbOpen, setSbOpen] = useState(false);
  const [sbForm, setSbForm] = useState({ kind: "sugestao" as "sugestao" | "bug" | "melhoria", subject: "", message: "" });
  const [sbSubmitting, setSbSubmitting] = useState(false);
  const [sbFiles, setSbFiles] = useState<File[]>([]);

  const MAX_FILES = 5;
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_SIZE) {
        toast({ title: `"${f.name}" excede 10MB`, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    setSbFiles((prev) => [...prev, ...valid].slice(0, MAX_FILES));
  };
  const removeFile = (i: number) => setSbFiles((prev) => prev.filter((_, idx) => idx !== i));

  const submitSuggestion = async () => {
    if (!user) return;
    if (sbForm.subject.trim().length < 3 || sbForm.message.trim().length < 5) {
      toast({ title: "Preencha título e descrição", variant: "destructive" });
      return;
    }
    setSbSubmitting(true);
    const tag = sbForm.kind === "bug" ? "[BUG]" : sbForm.kind === "melhoria" ? "[MELHORIA]" : "[SUGESTÃO]";
    const category = sbForm.kind === "bug" ? "bug" : "sugestao";

    // 1) Cria o ticket primeiro para termos o ID e organizarmos os anexos por ticket
    const { data: created, error } = await (supabase.from("support_tickets") as any).insert({
      user_id: user.id,
      subject: `${tag} ${sbForm.subject.trim()}`.slice(0, 160),
      category,
      priority: sbForm.kind === "bug" ? "alta" : "normal",
      message: sbForm.message.trim().slice(0, 4000),
      status: "aberto",
    }).select("id").single();

    // 2) Faz upload dos anexos e atualiza o ticket
    if (!error && created?.id && sbFiles.length > 0) {
      const uploaded: { path: string; name: string; size: number; type: string }[] = [];
      for (const f of sbFiles) {
        const safe = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `${user.id}/${created.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("support-attachments")
          .upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
        if (upErr) {
          toast({ title: `Falha ao enviar "${f.name}"`, description: upErr.message, variant: "destructive" });
          continue;
        }
        uploaded.push({ path, name: f.name, size: f.size, type: f.type });
      }
      if (uploaded.length > 0) {
        await (supabase.from("support_tickets") as any)
          .update({ attachments: uploaded })
          .eq("id", created.id);
      }
    }

    setSbSubmitting(false);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Enviado para análise", description: "Acompanhe o status em 'Meus chamados'." });
    setSbForm({ kind: "sugestao", subject: "", message: "" });
    setSbFiles([]);
    setSbOpen(false);
    setTab("meus");
    loadTickets();
  };

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
    const { data: hist } = await (supabase.from("support_ticket_status_history") as any)
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });
    setHistory((hist as StatusHistoryRow[]) ?? []);
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
    if (openTicket.status === "fechado") {
      toast({ title: "Chamado fechado", description: "Abra um novo chamado para continuar o atendimento.", variant: "destructive" });
      return;
    }
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
    // Lojista respondeu → volta para "Em andamento" para o suporte
    const next: TicketStatus = "em_andamento";
    await (supabase.from("support_tickets") as any)
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", openTicket.id);
    setOpenTicket({ ...openTicket, status: next });
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSbOpen(true)}
            className="ml-2 h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Sugestões & Bugs
          </Button>
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
                      {m.is_admin ? "Suporte Phonee" : "Você"} · {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                  </Card>
                ))}
                {history.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-surface-elevated/30 p-3">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-2">
                      <History className="h-3.5 w-3.5" /> Histórico do chamado
                    </div>
                    <ol className="space-y-1.5">
                      {history.map((h) => (
                        <li key={h.id} className="text-xs flex items-center gap-2 flex-wrap">
                          <span className="text-muted-foreground tabular-nums">
                            {new Date(h.created_at).toLocaleString("pt-BR")}
                          </span>
                          {h.from_status && (
                            <>
                              <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[h.from_status]}</Badge>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <Badge className={STATUS_BADGE[h.to_status] + " text-[10px]"}>{STATUS_LABEL[h.to_status]}</Badge>
                          <span className="text-muted-foreground">{h.changed_by_is_admin ? "· Suporte" : "· Você"}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {openTicket.status !== "resolvido" && openTicket.status !== "fechado" && (
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
                {openTicket.status === "fechado" && (
                  <p className="text-xs text-muted-foreground text-center py-2 border-t">
                    Este chamado foi fechado. Abra um novo se precisar de mais suporte.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={sbOpen} onOpenChange={setSbOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Sugestões & Bugs
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed">
              Este é o espaço para <strong>sugerir melhorias</strong>, propor novas <strong>funcionalidades</strong> e <strong>reportar erros ou bugs</strong>.
              Tudo o que você enviar é encaminhado direto para o time Phonee, fica registrado no seu histórico e você acompanha o status da análise por aqui.
            </div>

            <div>
              <Label>Tipo</Label>
              <Select value={sbForm.kind} onValueChange={(v: any) => setSbForm({ ...sbForm, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sugestao">💡 Sugestão</SelectItem>
                  <SelectItem value="melhoria">✨ Melhoria de algo existente</SelectItem>
                  <SelectItem value="bug">🐞 Bug / erro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Título</Label>
              <Input
                value={sbForm.subject}
                onChange={(e) => setSbForm({ ...sbForm, subject: e.target.value })}
                placeholder="Resuma em uma frase"
                maxLength={140}
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={sbForm.message}
                onChange={(e) => setSbForm({ ...sbForm, message: e.target.value })}
                placeholder={
                  sbForm.kind === "bug"
                    ? "Em qual tela ocorre, o que aconteceu, o que era esperado e como reproduzir."
                    : "Descreva sua ideia, onde no sistema ela se aplica e qual problema resolve."
                }
                rows={6}
                maxLength={4000}
              />
              <p className="text-xs text-muted-foreground mt-1">{sbForm.message.length}/4000</p>
            </div>

            <div>
              <Label className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" />
                Anexos (prints e arquivos)
              </Label>
              <label className="mt-1 flex items-center justify-center gap-2 cursor-pointer rounded-md border border-dashed border-border bg-surface-elevated/30 hover:bg-surface-elevated/60 transition py-3 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                Clique para escolher arquivos (até {MAX_FILES}, 10MB cada)
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,application/pdf,video/*,.txt,.log,.csv,.json"
                  onChange={(e) => { addFiles(e.target.files); e.currentTarget.value = ""; }}
                />
              </label>
              {sbFiles.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {sbFiles.map((f, i) => {
                    const isImg = f.type.startsWith("image/");
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-md border border-border/60 bg-surface-elevated/30 px-2.5 py-1.5 text-xs">
                        {isImg ? <ImageIcon className="h-3.5 w-3.5 text-primary shrink-0" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setSbOpen(false)}>Cancelar</Button>
              <Button onClick={submitSuggestion} disabled={sbSubmitting}>
                <Send className="h-4 w-4 mr-2" />
                {sbSubmitting ? "Enviando..." : "Enviar para análise"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}