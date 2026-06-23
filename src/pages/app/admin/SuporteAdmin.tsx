import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isAdminMaster } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Search, Send, CheckCircle2, Clock, AlertCircle, Inbox } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TicketStatus = "aberto" | "pendente" | "resolvido";

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

type Profile = { id: string; full_name: string | null; email: string | null };

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

export default function SuporteAdmin() {
  const { user, role } = useAuth();
  const [filter, setFilter] = useState<TicketStatus | "todos">("aberto");
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [openTicket, setOpenTicket] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");

  if (role && !isAdminMaster(role as any)) {
    return <Navigate to="/app" replace />;
  }

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

  useEffect(() => { load(); }, []);

  const loadThread = async (ticketId: string) => {
    const { data } = await (supabase.from("support_ticket_messages") as any)
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setThread((data as TicketMessage[]) ?? []);
  };

  const updateStatus = async (id: string, status: TicketStatus) => {
    const { error } = await (supabase.from("support_tickets") as any)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Chamado marcado como ${STATUS_LABEL[status]}` });
    if (openTicket?.id === id) setOpenTicket({ ...openTicket, status });
    load();
  };

  const sendReply = async () => {
    if (!openTicket || !user || reply.trim().length < 2) return;
    const { error } = await (supabase.from("support_ticket_messages") as any).insert({
      ticket_id: openTicket.id,
      user_id: user.id,
      is_admin: true,
      message: reply.trim().slice(0, 4000),
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await (supabase.from("support_tickets") as any)
      .update({ status: "pendente", updated_at: new Date().toISOString() })
      .eq("id", openTicket.id);
    setReply("");
    loadThread(openTicket.id);
    load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter !== "todos" && t.status !== filter) return false;
      if (q && !t.subject.toLowerCase().includes(q) && !t.message.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, filter, search]);

  const counts = useMemo(() => ({
    aberto: tickets.filter((t) => t.status === "aberto").length,
    pendente: tickets.filter((t) => t.status === "pendente").length,
    resolvido: tickets.filter((t) => t.status === "resolvido").length,
  }), [tickets]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte · Chamados"
        description="Gerencie os chamados abertos pelos lojistas da plataforma."
      />

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Em aberto</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{counts.aberto}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">Pendente</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{counts.pendente}</div>
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
              <TabsTrigger value="aberto">Em aberto</TabsTrigger>
              <TabsTrigger value="pendente">Pendente</TabsTrigger>
              <TabsTrigger value="resolvido">Resolvido</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
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
                <Select value={openTicket.status} onValueChange={(v) => updateStatus(openTicket.id, v as TicketStatus)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aberto">Em aberto</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="resolvido">Resolvido</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground self-center">
                  {profiles[openTicket.user_id]?.full_name || profiles[openTicket.user_id]?.email || "Usuário"}
                </div>
              </div>

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
                    placeholder="Responder ao lojista..."
                    rows={3}
                    maxLength={4000}
                  />
                  <Button onClick={sendReply} disabled={reply.trim().length < 2} size="sm">
                    <Send className="h-3.5 w-3.5 mr-1.5" />Enviar resposta
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}