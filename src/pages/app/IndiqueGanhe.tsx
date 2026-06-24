import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Gift, Copy, Share2, Trophy, Wallet, Users, CheckCircle2, Clock, XCircle, MessageCircle, Instagram, Facebook, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type Dashboard = {
  code: string | null;
  total: number;
  pendentes: number;
  convertidas: number;
  saldo_cents: number;
};
type Referral = {
  id: string; referral_code: string; referred_email: string | null;
  status: "pendente" | "convertida" | "cancelada"; bonus_cents: number;
  created_at: string; converted_at: string | null;
};
type Credit = {
  id: string; type: string; amount_cents: number; notes: string | null; created_at: string;
};
type RankRow = { rank: number; display_name: string; convertidas: number; total: number };

const BASE_URL = "https://phonee.com.br";

function shortCode(full: string | null) {
  if (!full) return "";
  return full.replace(/^PHONEE-/, "");
}

function buildMessage(link: string) {
  return `Olá! Conheci a Phonee — um sistema feito para lojas de smartphones, assistências e eletrônicos: estoque, vendas, financeiro e indicadores em tempo real, tudo num só lugar.

Te indiquei pra experimentar com vantagens. Cadastre-se pelo meu link: ${link}`;
}

export default function IndiqueGanhe() {
  const { user } = useAuth();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [ranking, setRanking] = useState<RankRow[]>([]);
  const [useOpen, setUseOpen] = useState(false);
  const [useAmount, setUseAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    // Garante código + carrega dashboard
    await supabase.rpc("generate_referral_code");
    const [{ data: d }, { data: r }, { data: c }, { data: rk }] = await Promise.all([
      supabase.rpc("referral_dashboard"),
      supabase.from("referrals").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("referral_credits").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("referral_ranking"),
    ]);
    setDash((d as any) ?? null);
    setRefs(((r as any) ?? []) as Referral[]);
    setCredits(((c as any) ?? []) as Credit[]);
    setRanking(((rk as any) ?? []) as RankRow[]);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const code = dash?.code ?? "";
  const shareCode = shortCode(code);
  const link = shareCode ? `${BASE_URL}/comprar?ref=${shareCode}` : "";
  const message = buildMessage(link);

  const copy = async (txt: string, label: string) => {
    try { await navigator.clipboard.writeText(txt); toast.success(`${label} copiado!`); }
    catch { toast.error("Não foi possível copiar"); }
  };

  const shareWA = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  const shareFB = () =>
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank");
  const shareIG = async () => {
    await copy(`${message}\n\n${link}`, "Mensagem");
    window.open("https://instagram.com", "_blank");
    toast.info("Cole no Instagram Direct ou Stories.");
  };

  const useCredit = async () => {
    const cents = Math.round(Number(useAmount.replace(",", ".")) * 100);
    if (!cents || cents <= 0) { toast.error("Informe um valor válido"); return; }
    if (cents > (dash?.saldo_cents ?? 0)) { toast.error("Saldo insuficiente"); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("use_referral_credit", {
      _amount_cents: cents, _notes: "Resgate para desconto na próxima mensalidade",
    });
    setBusy(false);
    if (error || !(data as any)?.ok) {
      toast.error((data as any)?.message ?? error?.message ?? "Falha");
      return;
    }
    toast.success("Saldo reservado. Será aplicado no próximo pagamento.");
    setUseOpen(false); setUseAmount("");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Indique e Ganhe"
        description="Convide outras lojas para o Phonee e ganhe R$ 10 por assinatura confirmada."
      />

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" /> Total de indicações</div>
          <div className="text-2xl font-bold mt-1">{dash?.total ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Pendentes</div>
          <div className="text-2xl font-bold mt-1 text-amber-500">{dash?.pendentes ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" /> Convertidas</div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">{dash?.convertidas ?? 0}</div>
        </Card>
        <Card className="p-4 bg-gradient-primary text-primary-foreground">
          <div className="flex items-center gap-2 text-xs opacity-90"><Wallet className="h-3.5 w-3.5" /> Saldo disponível</div>
          <div className="text-2xl font-bold mt-1">{brl((dash?.saldo_cents ?? 0) / 100)}</div>
          {(dash?.saldo_cents ?? 0) > 0 && (
            <Button size="sm" variant="secondary" className="mt-2 h-7 text-xs"
              onClick={() => setUseOpen(true)}>
              Usar como desconto
            </Button>
          )}
        </Card>
      </div>

      {/* Code + link + share */}
      <Card className="p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Seu código e link de indicação</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Código</Label>
            <div className="flex gap-2 mt-1">
              <Input value={code} readOnly className="font-mono font-semibold tracking-wider" />
              <Button variant="outline" onClick={() => copy(code, "Código")} title="Copiar código">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Link</Label>
            <div className="flex gap-2 mt-1">
              <Input value={link} readOnly className="font-mono text-xs" />
              <Button variant="outline" onClick={() => copy(link, "Link")} title="Copiar link">
                <LinkIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button onClick={shareWA} className="bg-[#25d366] hover:bg-[#25d366]/90 text-white">
            <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
          </Button>
          <Button onClick={shareIG} className="bg-[#e1306c] hover:bg-[#e1306c]/90 text-white">
            <Instagram className="h-4 w-4 mr-2" /> Instagram
          </Button>
          <Button onClick={shareFB} className="bg-[#1877f2] hover:bg-[#1877f2]/90 text-white">
            <Facebook className="h-4 w-4 mr-2" /> Facebook
          </Button>
          <Button variant="outline" onClick={() => copy(message, "Mensagem")}>
            <Share2 className="h-4 w-4 mr-2" /> Copiar mensagem
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Quando uma loja se cadastrar pelo seu link e confirmar o pagamento da assinatura, você recebe automaticamente R$ 10,00 de crédito.
        </p>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Histórico */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">Minhas indicações</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                <tr><th className="text-left py-2">Data</th><th className="text-left py-2">E-mail</th><th className="text-left py-2">Status</th><th className="text-right py-2">Bônus</th></tr>
              </thead>
              <tbody>
                {refs.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Nenhuma indicação ainda. Compartilhe seu link!</td></tr>
                )}
                {refs.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="py-2">{r.referred_email ?? "—"}</td>
                    <td className="py-2">
                      {r.status === "convertida" && <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Convertida</Badge>}
                      {r.status === "pendente"   && <Badge className="bg-amber-500/15 text-amber-600 border border-amber-500/30"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>}
                      {r.status === "cancelada"  && <Badge className="bg-rose-500/15 text-rose-600 border border-rose-500/30"><XCircle className="h-3 w-3 mr-1" />Cancelada</Badge>}
                    </td>
                    <td className="py-2 text-right font-medium">{brl(r.bonus_cents / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {credits.length > 0 && (
            <>
              <h3 className="font-semibold mt-6 mb-3">Extrato de créditos</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Data</th><th className="text-left py-2">Tipo</th><th className="text-left py-2">Observação</th><th className="text-right py-2">Valor</th></tr>
                  </thead>
                  <tbody>
                    {credits.map((c) => (
                      <tr key={c.id} className="border-b">
                        <td className="py-2 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="py-2 text-xs">{c.type === "credito_indicacao" ? "Bônus indicação" : c.type === "uso_desconto" ? "Uso de saldo" : "Ajuste"}</td>
                        <td className="py-2 text-muted-foreground">{c.notes ?? "—"}</td>
                        <td className={`py-2 text-right font-medium ${c.amount_cents < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {c.amount_cents >= 0 ? "+" : ""}{brl(c.amount_cents / 100)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {/* Ranking */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold">Top indicadores</h3>
          </div>
          {ranking.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem ranking. Seja o primeiro!</p>}
          <ol className="space-y-2">
            {ranking.map((r) => (
              <li key={r.rank} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <span className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${r.rank === 1 ? "bg-amber-500 text-white" : r.rank === 2 ? "bg-slate-400 text-white" : r.rank === 3 ? "bg-amber-700 text-white" : "bg-muted"}`}>{r.rank}</span>
                  {r.display_name}
                </span>
                <span className="text-xs text-muted-foreground">{r.convertidas} conv. · {r.total} total</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* Dialog usar saldo */}
      <Dialog open={useOpen} onOpenChange={setUseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usar saldo como desconto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Saldo disponível: <b>{brl((dash?.saldo_cents ?? 0) / 100)}</b>. O valor será aplicado como desconto no seu próximo pagamento de assinatura.
            </p>
            <div>
              <Label>Valor a usar (R$)</Label>
              <Input
                type="number" step="0.01" min="0"
                value={useAmount} onChange={(e) => setUseAmount(e.target.value)}
                placeholder="Ex: 10.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUseOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={useCredit} disabled={busy} className="bg-gradient-primary">{busy ? "Processando…" : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}