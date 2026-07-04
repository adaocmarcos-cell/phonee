import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExternalLink, Loader2, Megaphone, Search } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  nome: string;
  whatsapp: string;
  cidade: string | null;
  nome_loja: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  origem_pagina: string | null;
  status: string;
  created_at: string;
}

const STATUS: { value: string; label: string; tone: string }[] = [
  { value: "novo", label: "Novo", tone: "bg-primary/15 text-primary" },
  { value: "contatado", label: "Contatado", tone: "bg-info/15 text-info" },
  { value: "demonstracao", label: "Demonstração", tone: "bg-warning/15 text-warning" },
  { value: "cliente", label: "Cliente", tone: "bg-success/15 text-success" },
  { value: "perdido", label: "Perdido", tone: "bg-destructive/15 text-destructive" },
];

function digits(v: string) { return v.replace(/\D/g, ""); }
function whatsappLink(v: string) {
  const d = digits(v);
  const intl = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${intl}`;
}
function fmtDate(s: string) {
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
}

export default function LeadsAds() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!cancelled) {
        if (error) toast.error("Não foi possível carregar os leads");
        setLeads((data as Lead[]) ?? []);
        setLoading(false);
      }
    };
    load();
    const ch = (supabase as any)
      .channel("leads-ads")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, load)
      .subscribe();
    return () => { cancelled = true; (supabase as any).removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!s) return true;
      return [l.nome, l.whatsapp, l.cidade, l.nome_loja, l.utm_campaign]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [leads, search, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    const { error } = await (supabase as any)
      .from("leads").update({ status }).eq("id", id);
    if (error) {
      setLeads(prev);
      toast.error("Falha ao atualizar status");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-100">
            <Megaphone className="h-6 w-6 text-[#00abfb]" /> Leads dos anúncios
          </h1>
          <p className="text-sm text-slate-400">
            Leads capturados na landing <code>/comece</code> e formulários de tráfego pago.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, cidade, loja, campanha…"
              className="w-64 bg-slate-900 pl-8 text-slate-100"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 bg-slate-900 text-slate-100">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <Card className="border-slate-800 bg-slate-900/60">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            Nenhum lead ainda. Assim que a landing começar a rodar, eles aparecem aqui.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400">Quando</TableHead>
                <TableHead className="text-slate-400">Nome</TableHead>
                <TableHead className="text-slate-400">WhatsApp</TableHead>
                <TableHead className="text-slate-400">Cidade</TableHead>
                <TableHead className="text-slate-400">Loja</TableHead>
                <TableHead className="text-slate-400">Campanha</TableHead>
                <TableHead className="text-slate-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id} className="border-slate-800">
                  <TableCell className="whitespace-nowrap text-xs text-slate-400">
                    {fmtDate(l.created_at)}
                  </TableCell>
                  <TableCell className="font-medium text-slate-100">{l.nome}</TableCell>
                  <TableCell>
                    <a
                      href={whatsappLink(l.whatsapp)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#00abfb] hover:underline"
                    >
                      {l.whatsapp}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell className="text-slate-200">{l.cidade ?? "—"}</TableCell>
                  <TableCell className="text-slate-200">{l.nome_loja ?? "—"}</TableCell>
                  <TableCell className="text-slate-300">
                    {l.utm_campaign ? (
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold text-slate-200">{l.utm_campaign}</span>
                        <span className="text-slate-500">
                          {[l.utm_source, l.utm_medium].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">orgânico</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={l.status}
                      onValueChange={(v) => updateStatus(l.id, v)}
                    >
                      <SelectTrigger className="h-8 w-36 bg-slate-950 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            <Badge
                              variant="secondary"
                              className={"mr-1 " + s.tone}
                            >
                              {s.label}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}