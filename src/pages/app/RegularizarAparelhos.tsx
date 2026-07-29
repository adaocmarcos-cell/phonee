import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { isValidImei } from "@/lib/itemKind";
import { loadDataHealth, loadPendingDevices, syncDataHealthAlert, type DataHealth } from "@/lib/dataHealth";

type Row = {
  id: string; name: string; brand: string | null; sku: string | null;
  imei: string | null; color: string | null; storage_gb: number | null;
  stock_current: number; condition: string | null;
};

export default function RegularizarAparelhos() {
  const { store } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<DataHealth | null>(null);
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const [list, h] = await Promise.all([loadPendingDevices(store.id), loadDataHealth(store.id)]);
      setRows(list as Row[]);
      setHealth(h);
    } catch (e: any) {
      toast.error(`Erro ao carregar pendências: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [store?.id]);

  useEffect(() => { load(); }, [load]);

  const faltam = rows.length;
  const pct = health && health.aparelhos_total > 0
    ? Math.round(((health.aparelhos_total - faltam) / health.aparelhos_total) * 100)
    : 100;

  const saveRow = async (row: Row, index: number) => {
    const raw = (values[row.id] ?? "").replace(/\D/g, "");
    if (!isValidImei(raw)) {
      toast.error("IMEI inválido: informe 15 dígitos válidos.");
      return;
    }
    setSaving(row.id);
    const patch = (row.stock_current ?? 0) > 1 ? { imei: raw, stock_current: 1 } : { imei: raw };
    const { error } = await supabase.from("products").update(patch).eq("id", row.id);
    setSaving(null);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Este IMEI já está cadastrado nesta loja." : error.message);
      return;
    }
    toast.success(`${row.name} regularizado.`);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const next = rows[index + 1];
    if (next) setTimeout(() => refs.current[next.id]?.focus(), 50);
    if (store?.id) syncDataHealthAlert(store.id).then(setHealth);
  };

  const describe = (r: Row) =>
    [r.brand, r.color, r.storage_gb ? `${r.storage_gb}GB` : null, r.sku].filter(Boolean).join(" · ") || "—";

  const concluido = !loading && faltam === 0;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Regularizar aparelhos" description="Informe o IMEI de cada aparelho — um por linha, sem abrir formulário." />

      <Card className="p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Smartphone className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-medium">
              {concluido ? "Tudo regularizado 🎉" : `Faltam ${faltam} aparelho(s)`}
            </div>
            <div className="text-xs text-muted-foreground">
              {health ? `${health.aparelhos_total - faltam} de ${health.aparelhos_total} com IMEI cadastrado` : "—"}
              {health && !health.vencido ? ` · ${health.dias_restantes} dia(s) de prazo` : ""}
            </div>
          </div>
          {concluido && (
            <Button variant="outline" onClick={() => navigate("/painel/estoque")}>Voltar ao estoque</Button>
          )}
        </div>
        <Progress value={pct} className="h-1.5 mt-3" />
      </Card>

      {loading ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Carregando…</Card>
      ) : concluido ? (
        <Card className="p-10 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-success mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma pendência. Novos aparelhos já nascem com IMEI obrigatório.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <Card key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{describe(r)}</div>
                {r.stock_current > 1 && (
                  <Badge variant="outline" className="mt-1 text-[10px] border-warning/40 text-warning">
                    {r.stock_current} unidades — será ajustado para 1
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  ref={(el) => { refs.current[r.id] = el; }}
                  value={values[r.id] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [r.id]: e.target.value.replace(/\D/g, "").slice(0, 15) }))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveRow(r, i); }}
                  inputMode="numeric"
                  placeholder="IMEI (15 dígitos)"
                  className="w-full sm:w-52 font-mono"
                  autoFocus={i === 0}
                />
                <Button size="sm" onClick={() => saveRow(r, i)} disabled={saving === r.id} className="gap-1.5">
                  {saving === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
