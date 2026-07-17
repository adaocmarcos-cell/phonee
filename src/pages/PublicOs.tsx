// Página pública de acompanhamento de OS.
// Rota: /os/:token — fora do ProtectedRoute, mobile-first.
// Toda a leitura de dados passa pela RPC `get_public_os`, que devolve
// apenas campos seguros. Nenhum acesso direto a tabelas.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck, Clock, Phone, Mail,
  MapPin, Smartphone as SmartphoneIcon, Wrench, ClipboardList, Receipt,
} from "lucide-react";

type OsData = {
  os_number: number | null;
  status: string;
  budget_status: "pendente" | "aprovado" | "reprovado";
  customer_first_name: string;
  device: { category?: string; brand?: string; model?: string; color?: string; storage?: string };
  reasons: string[];
  issue_description: string | null;
  estimated_days: number | null;
  budget: { parts: number; labor: number; total: number };
  dates: { created_at: string; start_date: string | null; end_date: string | null; signed_at: string | null };
  warranty_until: string | null;
  budget_decision: null | { status: string; name: string | null; decided_at: string };
  store: {
    name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  recebido:              { label: "Recebido",               color: "#64748b" },
  em_analise:            { label: "Em análise",             color: "#0ea5e9" },
  aguardando_orcamento:  { label: "Aguardando orçamento",   color: "#f59e0b" },
  aguardando_aprovacao:  { label: "Aguardando aprovação",   color: "#f59e0b" },
  aguardando_peca:       { label: "Aguardando peça",        color: "#a855f7" },
  em_reparo:             { label: "Em reparo",              color: "#2563eb" },
  em_testes:             { label: "Em testes",              color: "#2563eb" },
  pronto_retirada:       { label: "Pronto para retirada",   color: "#16a34a" },
  entregue:              { label: "Entregue",               color: "#15803d" },
  cancelado:             { label: "Cancelado",              color: "#dc2626" },
};

const TIMELINE_ORDER = [
  "recebido",
  "em_analise",
  "aguardando_orcamento",
  "aguardando_aprovacao",
  "em_reparo",
  "em_testes",
  "pronto_retirada",
  "entregue",
] as const;

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR") : "—";

export default function PublicOs() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OsData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    setLoading(true);
    const { data: res, error } = await (supabase as any).rpc("get_public_os", { _token: token });
    if (error || !res) { setNotFound(true); setLoading(false); return; }
    setData(res as OsData);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const store = data?.store;
  const primary = store?.primary_color || "#0F4C81";
  const storeName = store?.name || "Assistência Técnica";

  // Ajusta título e cor de tema quando os dados chegam.
  useEffect(() => {
    if (!data) return;
    document.title = `OS #${String(data.os_number ?? "").padStart(4, "0")} — ${storeName}`;
  }, [data, storeName]);

  const currentStatus = data?.status ?? "";
  const statusMeta = STATUS_META[currentStatus] || { label: currentStatus, color: primary };
  const deviceLabel = useMemo(() => {
    const d = data?.device;
    if (!d) return "—";
    return [d.brand, d.model, d.color, d.storage].filter(Boolean).join(" ") || "—";
  }, [data]);

  const totalStr = brl(Number(data?.budget?.total ?? 0));

  const decide = async (decision: "aprovar" | "recusar") => {
    if (!token) return;
    if (!name.trim()) return toast.error("Informe seu nome completo.");
    if (!accept) return toast.error("É necessário confirmar o aceite.");
    setBusy(true);
    // Descobre o IP público do cliente (sem bloquear caso o serviço falhe)
    let ip: string | null = null;
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      if (r.ok) { const j = await r.json(); ip = j?.ip || null; }
    } catch { /* noop */ }
    const { data: res, error } = await (supabase as any).rpc("approve_public_budget", {
      _token: token, _decision: decision, _name: name.trim(), _ip: ip,
    });
    setBusy(false);
    if (error) {
      const code = (error as any)?.message || "";
      if (code.includes("orcamento_ja_decidido")) return toast.error("Este orçamento já foi decidido.");
      if (code.includes("nome_obrigatorio")) return toast.error("Informe seu nome completo.");
      return toast.error("Não foi possível registrar. Tente novamente.");
    }
    toast.success(decision === "aprovar" ? "Orçamento aprovado! ✅" : "Orçamento recusado.");
    void res; await load();
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando…
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <XCircle className="h-10 w-10 text-destructive mb-3" />
        <h1 className="text-lg font-semibold">Link inválido ou expirado</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Confira o endereço recebido ou entre em contato com a loja.
        </p>
      </div>
    );
  }

  const canDecide = data.budget_status === "pendente";

  return (
    <div className="min-h-dvh bg-muted/30">
      {/* Header com identidade da loja */}
      <header className="w-full text-white" style={{ backgroundColor: primary }}>
        <div className="max-w-2xl mx-auto px-4 py-5 flex items-center gap-3">
          {store?.logo_url ? (
            <img src={store.logo_url} alt={storeName} className="h-12 w-12 rounded-lg object-contain bg-white/10 p-1" />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-white/15 flex items-center justify-center font-bold">
              {storeName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs opacity-80 leading-none">Acompanhamento de OS</p>
            <h1 className="text-lg font-semibold truncate">{storeName}</h1>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] uppercase tracking-widest opacity-80">OS</p>
            <p className="text-xl font-mono font-bold">
              #{String(data.os_number ?? "").padStart(4, "0")}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Status atual */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-widest">Status atual</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: statusMeta.color }}
                />
                <span className="font-semibold">{statusMeta.label}</span>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-[11px]"
              style={{ color: primary, borderColor: primary + "80" }}
            >
              {data.budget_status === "aprovado" && "Orçamento aprovado"}
              {data.budget_status === "reprovado" && "Orçamento recusado"}
              {data.budget_status === "pendente" && "Aguardando aprovação"}
            </Badge>
          </div>

          {/* Timeline simples */}
          <ol className="mt-4 grid grid-cols-4 gap-1">
            {TIMELINE_ORDER.map((s, i) => {
              const activeIdx = TIMELINE_ORDER.indexOf(currentStatus as any);
              const reached = activeIdx >= 0 && i <= activeIdx;
              const isCurrent = s === currentStatus;
              return (
                <li key={s} className="flex flex-col items-center text-center">
                  <div
                    className={`h-2 w-full rounded-full ${isCurrent ? "" : ""}`}
                    style={{ backgroundColor: reached ? primary : "#e5e7eb" }}
                  />
                  <span className={`mt-1 text-[10px] leading-tight ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                    {STATUS_META[s]?.label}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Aberta em {fmtDate(data.dates.created_at)}
            </div>
            {data.dates.end_date && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluída em {fmtDate(data.dates.end_date)}
              </div>
            )}
          </div>
        </Card>

        {/* Aparelho + defeito */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SmartphoneIcon className="h-4 w-4" /> Aparelho
          </div>
          <p className="mt-2 text-base font-medium">{deviceLabel}</p>

          <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="h-4 w-4" /> Defeito relatado
          </div>
          <p className="mt-1 text-sm">
            {(data.reasons || []).join(", ") || "—"}
          </p>
          {data.issue_description && (
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
              {data.issue_description}
            </p>
          )}
        </Card>

        {/* Orçamento */}
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4" /> Orçamento
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-widest">Peças</p>
              <p className="font-medium">{brl(Number(data.budget.parts || 0))}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-widest">Mão de obra</p>
              <p className="font-medium">{brl(Number(data.budget.labor || 0))}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase text-muted-foreground tracking-widest">Total</p>
              <p className="font-bold" style={{ color: primary }}>{totalStr}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />
              Prazo estimado: {data.estimated_days ? `${data.estimated_days} dia(s)` : "a definir"}
            </div>
            {data.warranty_until && (
              <div className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />
                Garantia até {fmtDate(data.warranty_until)}
              </div>
            )}
          </div>
        </Card>

        {/* Aprovação */}
        {canDecide ? (
          <Card className="p-4 border-primary/40">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wrench className="h-4 w-4" /> Aprovação do orçamento
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Olá{data.customer_first_name ? `, ${data.customer_first_name}` : ""}! Precisamos do seu OK para prosseguir com o serviço.
            </p>

            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="nome">Seu nome completo</Label>
                <Input
                  id="nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como assinado no documento"
                  autoComplete="name"
                />
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={accept} onCheckedChange={(v) => setAccept(!!v)} className="mt-0.5" />
                <span>
                  Li e aprovo o valor de <strong>{totalStr}</strong> para o serviço descrito acima.
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <Button
                  onClick={() => decide("aprovar")}
                  disabled={busy || !accept || !name.trim()}
                  className="w-full"
                  style={{ backgroundColor: primary }}
                >
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Aprovar orçamento
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decide("recusar")}
                  disabled={busy || !name.trim()}
                  className="w-full"
                >
                  <XCircle className="h-4 w-4 mr-2" /> Recusar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sua decisão é registrada com data, horário e IP para segurança de ambas as partes.
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {data.budget_status === "aprovado"
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <XCircle className="h-4 w-4 text-destructive" />}
              Orçamento {data.budget_status === "aprovado" ? "aprovado" : "recusado"}
            </div>
            {data.budget_decision && (
              <p className="mt-1 text-sm text-muted-foreground">
                Registrado por <strong>{data.budget_decision.name || "cliente"}</strong> em {fmtDateTime(data.budget_decision.decided_at)}.
              </p>
            )}
          </Card>
        )}

        {/* Contato da loja */}
        <Card className="p-4">
          <p className="text-[11px] uppercase text-muted-foreground tracking-widest">Contato da loja</p>
          <p className="font-semibold mt-1">{storeName}</p>
          <div className="mt-2 space-y-1 text-sm">
            {store?.phone && (
              <a href={`tel:${store.phone}`} className="flex items-center gap-2 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {store.phone}
              </a>
            )}
            {store?.email && (
              <a href={`mailto:${store.email}`} className="flex items-center gap-2 hover:underline">
                <Mail className="h-3.5 w-3.5" /> {store.email}
              </a>
            )}
            {store?.address && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5" /> {store.address}
              </div>
            )}
          </div>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground py-4">
          Página segura de acompanhamento — nenhum dado sensível é exibido publicamente.
        </p>
      </main>
    </div>
  );
}