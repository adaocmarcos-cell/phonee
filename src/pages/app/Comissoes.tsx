import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { CheckCircle2, DollarSign, ExternalLink, Receipt, Wrench, Undo2 } from "lucide-react";

type Entry = {
  id: string;
  store_id: string;
  user_id: string;
  origin: "venda" | "os";
  sale_id: string | null;
  os_id: string | null;
  rule_id: string | null;
  base_amount: number;
  commission_amount: number;
  status: "a_pagar" | "pago" | "estornado";
  paid_at: string | null;
  expense_id: string | null;
  created_at: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function Comissoes() {
  const { store, user, role } = useAuth();
  const canManage = ["dono", "gerente", "financeiro", "admin_master", "administrador"].includes(role || "");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!store) return;
    setLoading(true);
    let q = (supabase as any)
      .from("commission_entries")
      .select("*")
      .eq("store_id", store.id)
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59`)
      .order("created_at", { ascending: false });
    if (originFilter !== "all") q = q.eq("origin", originFilter);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (personFilter !== "all") q = q.eq("user_id", personFilter);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else {
      const list = (data as Entry[]) ?? [];
      setEntries(list);
      const ids = Array.from(new Set(list.map((e) => e.user_id)));
      if (ids.length) {
        const { data: profs } = await (supabase as any).from("profiles").select("id, full_name, email").in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
        setPeople(map);
      }
    }
    setLoading(false);
    setSelected(new Set());
  };

  useEffect(() => { load(); /* eslint-disable-line */ }, [store?.id, from, to, personFilter, originFilter, statusFilter]);

  const totals = useMemo(() => {
    const t = { a_pagar: 0, pago: 0, estornado: 0 };
    for (const e of entries) t[e.status] += Number(e.commission_amount || 0);
    return t;
  }, [entries]);

  const byPerson = useMemo(() => {
    const g: Record<string, Entry[]> = {};
    for (const e of entries) (g[e.user_id] ||= []).push(e);
    return g;
  }, [entries]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const selectAllPending = () => {
    setSelected(new Set(entries.filter((e) => e.status === "a_pagar").map((e) => e.id)));
  };
  const selectAllForPerson = (uid: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      entries.filter((e) => e.user_id === uid && e.status === "a_pagar").forEach((e) => n.add(e.id));
      return n;
    });
  };

  const pay = async () => {
    if (!canManage) return toast.error("Sem permissão");
    const ids = Array.from(selected);
    if (!ids.length) return toast.error("Nenhum lançamento selecionado");
    const { data, error } = await (supabase as any).rpc("pay_commission_entries", {
      _entry_ids: ids,
      _payment_method: "dinheiro",
      _expense_date: todayIso(),
      _notes: null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Despesa criada: ${brl(Number((data as any)?.total || 0))}`);
    load();
  };

  const reverse = async (expense_id: string) => {
    if (!canManage) return;
    if (!confirm("Estornar este pagamento? A despesa será excluída.")) return;
    const { error } = await (supabase as any).rpc("reverse_commission_payment", { _expense_id: expense_id });
    if (error) return toast.error(error.message);
    toast.success("Pagamento estornado");
    load();
  };

  const persons = Array.from(new Set(entries.map((e) => e.user_id)));

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Comissões" description="Lançamentos gerados por vendas e ordens de serviço." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 border-border">
          <div className="text-xs text-muted-foreground">A pagar</div>
          <div className="text-2xl font-semibold text-primary">{brl(totals.a_pagar)}</div>
        </Card>
        <Card className="p-4 border-border">
          <div className="text-xs text-muted-foreground">Pago no período</div>
          <div className="text-2xl font-semibold">{brl(totals.pago)}</div>
        </Card>
        <Card className="p-4 border-border">
          <div className="text-xs text-muted-foreground">Estornado</div>
          <div className="text-2xl font-semibold text-muted-foreground">{brl(totals.estornado)}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3 border-border">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Pessoa</label>
            <Select value={personFilter} onValueChange={setPersonFilter} disabled={!canManage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {persons.map((p) => (
                  <SelectItem key={p} value={p}>{people[p] || p.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Origem</label>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="venda">Venda</SelectItem>
                <SelectItem value="os">OS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="a_pagar">A pagar</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="estornado">Estornado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={selectAllPending} disabled={!canManage}>Selecionar pendentes</Button>
            <Button onClick={pay} disabled={!canManage || selected.size === 0}>
              <DollarSign className="h-4 w-4 mr-1" /> Pagar ({selected.size})
            </Button>
          </div>
        </div>
      </Card>

      <Card className="border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2 text-left">Data</th>
                <th className="p-2 text-left">Pessoa</th>
                <th className="p-2 text-left">Origem</th>
                <th className="p-2 text-right">Base</th>
                <th className="p-2 text-right">Comissão</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
              {!loading && entries.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sem lançamentos no período.</td></tr>}
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-2">
                    {e.status === "a_pagar" && canManage && (
                      <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                    )}
                  </td>
                  <td className="p-2">{new Date(e.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="p-2">
                    <button onClick={() => canManage && selectAllForPerson(e.user_id)} className="hover:underline text-left">
                      {people[e.user_id] || e.user_id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="p-2">
                    {e.origin === "venda" ? (
                      <Link to={`/painel/vendas/${e.sale_id}/editar`} className="inline-flex items-center gap-1 hover:underline">
                        <Receipt className="h-3.5 w-3.5" /> Venda <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <Link to={`/painel/ordens/${e.os_id}`} className="inline-flex items-center gap-1 hover:underline">
                        <Wrench className="h-3.5 w-3.5" /> OS <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{brl(Number(e.base_amount))}</td>
                  <td className="p-2 text-right tabular-nums font-medium">{brl(Number(e.commission_amount))}</td>
                  <td className="p-2">
                    {e.status === "a_pagar" && <Badge variant="outline">A pagar</Badge>}
                    {e.status === "pago" && <Badge className="bg-green-500/15 text-green-600 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Pago</Badge>}
                    {e.status === "estornado" && <Badge variant="secondary">Estornado</Badge>}
                  </td>
                  <td className="p-2 text-right">
                    {e.status === "pago" && canManage && e.expense_id && (
                      <Button size="sm" variant="ghost" onClick={() => reverse(e.expense_id!)}>
                        <Undo2 className="h-3.5 w-3.5 mr-1" /> Estornar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}