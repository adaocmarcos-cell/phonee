import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/PageHeader";
import { Search, Send, CheckCircle2, Clock, AlertCircle, Inbox, History, UserCheck, Loader2, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TicketStatus = "aberto" | "em_andamento" | "aguardando_cliente" | "pendente" | "resolvido" | "fechado";

type Ticket = {
  id: string;
  user_id: string;
  store_id: string | null;
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
  changed_by: string | null;
  changed_by_is_admin: boolean;
  note: string | null;
  created_at: string;
};

type Profile = { id: string; full_name: string | null; email: string | null };

const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Novo",
  em_andamento: "Em andamento",
  aguardando_cliente: "Aguardando cliente",
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

const STATUS_OPTIONS: TicketStatus[] = ["aberto", "em_andamento", "aguardando_cliente", "pendente", "resolvido", "fechado"];

const STATUS_CONFIRM: Partial<Record<TicketStatus, { title: string; description: string }>> = {
  resolvido: {
    title: "Marcar como Resolvido?",
    description: "O lojista será notificado de que o chamado foi resolvido e poderá reabrir caso o problema persista.",
  },
  fechado: {
    title: "Fechar chamado?",
    description: "Chamados fechados não podem mais receber respostas. Use apenas quando o atendimento estiver concluído e validado.",
  },
  aguardando_cliente: {
    title: "Aguardando retorno do cliente?",
    description: "O chamado fica pausado até o lojista responder. Confirma a mudança?",
  },
};

export default function SuporteAdmin() {
  const { user, role } = useAuth();
  // Admin master is a GLOBAL role (not store-scoped). The `role` from useAuth is store-scoped,
  // so we must verify admin_master directly against user_roles.
  const [accessState, setAccessState] = useState<"loading" | "ok" | "deny">("loading");
  const [filter, setFilter] = useState<TicketStatus | "todos">("aberto");
  const [catFilter, setCatFilter] = useState<string>("todas");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { if (!cancelled) setAccessState("deny"); return; }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id)
        .eq("role", "admin_master")
        .maybeSingle();
      if (!cancelled) setAccessState(data ? "ok" : "deny");
    })();
    return () => { cancelled = true; };
  }, []);

  const load = async () => {
    const { data } = await (supabase.from("support_tickets") as any)
      .select("*")
      .order("updated_at", { ascending: false });
    const list = (data as Ticket[]) ?? [];
    setTickets(list);
    const ids = Array.from(new Set(list.map((t) => t.user_id)));
    if (ids.length > 0) {
      const { data: profs } = await (supabase.from("profiles") as any)
        .select("id, full_name, email")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      (profs as Profile[] ?? []).forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    }
  };

  useEffect(() => { if (accessState === "ok") load(); }, [accessState]);

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

  const performUpdateStatus = async (id: string, status: TicketStatus) => {
    const { error } = await (supabase.from("support_tickets") as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Chamado marcado como ${STATUS_LABEL[status]}` });
    if (openTicket?.id === id) { setOpenTicket({ ...openTicket, status }); loadThread(id); }
    load();
  };

  const requestUpdateStatus = (status: TicketStatus) => {
    if (!openTicket || openTicket.status === status) return;
    if (openTicket.status === "fechado" && status !== "fechado") {
      // Reabertura precisa confirmar
      setPendingStatus(status);
      return;
    }
    if (STATUS_CONFIRM[status]) {
      setPendingStatus(status);
      return;
    }
    performUpdateStatus(openTicket.id, status);
  };

  const sendReply = async () => {
    if (!openTicket || !user || reply.trim().length < 2) return;
    if (openTicket.status === "fechado") {
      toast({ title: "Chamado fechado", description: "Reabra o chamado antes de responder.", variant: "destructive" });
      return;
    }
    const { error } = await (supabase.from("support_ticket_messages") as any).insert({
      ticket_id: openTicket.id,
      user_id: user.id,
      is_admin: true,
      message: reply.trim().slice(0, 4000),
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    // Resposta do suporte → aguardando retorno do cliente
    const next: TicketStatus = "aguardando_cliente";
    await (supabase.from("support_tickets") as any)
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", openTicket.id);
    if (openTicket) setOpenTicket({ ...openTicket, status: next });
    setReply("");
    loadThread(openTicket.id);
    load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter !== "todos" && t.status !== filter) return false;
      if (catFilter !== "todas" && (t.category || "").toLowerCase() !== catFilter) return false;
      if (q && !t.subject.toLowerCase().includes(q) && !t.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, filter, catFilter, search]);

  const counts = useMemo(() => ({
    aberto: tickets.filter((t) => t.status === "aberto").length,
    em_andamento: tickets.filter((t) => t.status === "em_andamento" || t.status === "pendente").length,
    aguardando_cliente: tickets.filter((t) => t.status === "aguardando_cliente").length,
    resolvido: tickets.filter((t) => t.status === "resolvido").length,
    fechado: tickets.filter((t) => t.status === "fechado").length,
  }), [tickets]);

  if (accessState === "loading") {
    return <div className="p-8 text-center text-muted-foreground text-xs font-mono">VERIFICANDO ACESSO…</div>;
  }
  if (accessState === "deny") {
    return <Navigate to="/painel" replace />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte · Chamados"
        description="Gerencie dúvidas, dicas, bugs e sugestões enviados pelos lojistas."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Novos</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{counts.aberto}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Em andamento</div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">{counts.em_andamento}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Aguardando cliente</div>
          <div className="text-2xl font-bold text-orange-600 mt-1">{counts.aguardando_cliente}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Resolvido</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{counts.resolvido}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="aberto">Novos</TabsTrigger>
              <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
              <TabsTrigger value="aguardando_cliente">Aguardando cliente</TabsTrigger>
              <TabsTrigger value="resolvido">Resolvido</TabsTrigger>
              <TabsTrigger value="fechado">Fechado</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="dica">Dica</SelectItem>
              <SelectItem value="sugestao">Sugestão</SelectItem>
              <SelectItem value="duvida">Dúvida</SelectItem>
              <SelectItem value="financeiro">Financeiro</SelectItem>
              <SelectItem value="outros">Outros</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum chamado neste filtro.
          </Card>
        ) : (
          filtered.map((t) => {
            const Icon = STATUS_ICON[t.status];
            const p = profiles[t.user_id];
            return (
              <Card
                key={t.id}
                className="p-4 cursor-pointer hover:bg-surface-elevated/40 transition"
                onClick={() => { setOpenTicket(t); loadThread(t.id); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={STATUS_BADGE[t.status]}>
                        <Icon className="h-3 w-3 mr-1" />{STATUS_LABEL[t.status]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                      {t.priority && <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>}
                    </div>
                    <h4 className="font-medium mt-1.5 truncate">{t.subject}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {p?.full_name || p?.email || "Usuário"} · {new Date(t.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!openTicket} onOpenChange={(o) => !o && setOpenTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {openTicket && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <Badge className={STATUS_BADGE[openTicket.status]}>{STATUS_LABEL[openTicket.status]}</Badge>
                  {openTicket.subject}
                </DialogTitle>
              </DialogHeader>

              <div className="flex gap-2 flex-wrap pb-2 border-b">
                <Select value={openTicket.status} onValueChange={(v) => requestUpdateStatus(v as TicketStatus)}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground self-center">
                  {profiles[openTicket.user_id]?.full_name || profiles[openTicket.user_id]?.email || "Usuário"}
                </div>
              </div>

              {history.length > 0 && (
                <div className="mt-3 rounded-md border border-border/60 bg-surface-elevated/30 p-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground font-mono mb-2">
                    <History className="h-3.5 w-3.5" /> Histórico de status
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
                        <span className="text-muted-foreground">
                          {h.changed_by_is_admin ? "· Suporte" : "· Lojista"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="space-y-3 mt-3">
                <Card className="p-3 bg-surface-elevated/40">
                  <p className="text-xs text-muted-foreground mb-1">
                    Lojista · {new Date(openTicket.created_at).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{openTicket.message}</p>
                </Card>
                {thread.map((m) => (
                  <Card key={m.id} className={`p-3 ${m.is_admin ? "bg-primary/5 border-primary/30" : "bg-surface-elevated/40"}`}>
                    <p className="text-xs text-muted-foreground mb-1">
                      {m.is_admin ? "Você (Suporte)" : "Lojista"} · {new Date(m.created_at).toLocaleString("pt-BR")}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{m.message}</p>
                  </Card>
                ))}
                <div className="space-y-2 pt-2 border-t">
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={openTicket.status === "fechado" ? "Chamado fechado — reabra para responder." : "Responder ao lojista..."}
                    rows={3}
                    maxLength={4000}
                    disabled={openTicket.status === "fechado"}
                  />
                  <Button onClick={sendReply} disabled={reply.trim().length < 2 || openTicket.status === "fechado"} size="sm">
                    <Send className="h-3.5 w-3.5 mr-1.5" />Enviar resposta
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingStatus} onOpenChange={(o) => { if (!o) setPendingStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus ? (STATUS_CONFIRM[pendingStatus]?.title ?? `Mudar para ${STATUS_LABEL[pendingStatus]}?`) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus
                ? (STATUS_CONFIRM[pendingStatus]?.description ??
                   `Confirma a mudança de status para "${STATUS_LABEL[pendingStatus]}"?`)
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (openTicket && pendingStatus) performUpdateStatus(openTicket.id, pendingStatus);
                setPendingStatus(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}