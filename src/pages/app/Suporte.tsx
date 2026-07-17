import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  Bug, Lightbulb, Wrench, History, UserCheck, Loader2, Lock, Paperclip, X, FileText, Image as ImageIcon,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { HELP_MODULES } from "@/content/helpManual";

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

// Manual movido para src/content/helpManual.ts (HELP_MODULES).

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);

  const [form, setForm] = useState({ subject: "", category: "duvida", priority: "normal", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<string>(() => searchParams.get("tab") || "ajuda");
  const focusModuleId = searchParams.get("modulo");
  const moduleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [openAccordion, setOpenAccordion] = useState<string | undefined>(undefined);

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
    if (!q) return HELP_MODULES;
    return HELP_MODULES.filter((m) => {
      const haystack = [
        m.title,
        m.whatIs,
        ...m.steps.map((s) => `${s.title} ${s.detail}`),
        ...(m.tips ?? []),
        ...(m.faq ?? []).map((f) => `${f.q} ${f.a}`),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [search]);

  // Sincroniza aba com query param
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== tab) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Rola até o módulo alvo e abre o accordion
  useEffect(() => {
    if (tab !== "ajuda" || !focusModuleId) return;
    setOpenAccordion(focusModuleId);
    const el = moduleRefs.current[focusModuleId];
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
  }, [tab, focusModuleId, filteredTopics.length]);

  const handleTabChange = (v: string) => {
    setTab(v);
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte"
        description="Tire dúvidas sobre o sistema, consulte a base de ajuda ou abra um chamado com nossa equipe."
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
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
            <Lightbulb className="h-3.5 w-3.5" />
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
            <Accordion
              type="single"
              collapsible
              value={openAccordion}
              onValueChange={setOpenAccordion}
              className="space-y-3"
            >
              {filteredTopics.map((mod) => {
                const Icon = mod.icon;
                const highlight = mod.id === focusModuleId;
                return (
                  <div
                    key={mod.id}
                    ref={(el) => (moduleRefs.current[mod.id] = el)}
                  >
                    <AccordionItem
                      value={mod.id}
                      className={`rounded-lg border ${highlight ? "border-primary/60 ring-2 ring-primary/20" : "border-border"} bg-card`}
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-2.5 text-left">
                          <span className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm">{mod.title}</div>
                            <div className="text-xs text-muted-foreground line-clamp-1">{mod.whatIs}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">{mod.whatIs}</p>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Passo a passo</div>
                          <ol className="space-y-2.5">
                            {mod.steps.map((s, i) => (
                              <li key={i} className="flex gap-3 text-sm">
                                <span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center">
                                  {i + 1}
                                </span>
                                <div>
                                  <div className="font-medium text-foreground">{s.title}</div>
                                  <div className="text-muted-foreground leading-relaxed">{s.detail}</div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>

                        {mod.tips && mod.tips.length > 0 && (
                          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5">Dicas</div>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                              {mod.tips.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {mod.faq && mod.faq.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-foreground/70 mb-2">Perguntas frequentes</div>
                            <div className="space-y-2">
                              {mod.faq.map((f, i) => (
                                <div key={i} className="rounded-md border border-border p-3">
                                  <div className="text-sm font-medium">{f.q}</div>
                                  <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{f.a}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </div>
                );
              })}
            </Accordion>
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
              <Lightbulb className="h-4 w-4 text-primary" />
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