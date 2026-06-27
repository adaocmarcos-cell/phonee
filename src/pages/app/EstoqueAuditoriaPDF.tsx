import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Download, FileText, AlertTriangle, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Audit = {
  id: string;
  store_id: string;
  user_email: string | null;
  filename: string;
  total_pdf_items: number;
  total_db_items: number;
  ok_count: number;
  inserted_count: number;
  updated_count: number;
  divergences_count: number;
  total_units_pdf: number;
  total_units_db: number;
  divergences: Array<{ sku: string; name: string; pdf_qty: number; db_qty: number; diff: number; reason?: string }>;
  csv_data: string | null;
  notes: string | null;
  created_at: string;
};

function toCsv(audit: Audit): string {
  const header = ["sku", "nome", "qty_pdf", "qty_db", "diferenca", "observacao"];
  const rows = (audit.divergences || []).map(d => [
    d.sku, `"${(d.name || "").replace(/"/g, '""')}"`,
    d.pdf_qty, d.db_qty, d.diff, `"${(d.reason || "").replace(/"/g, '""')}"`
  ].join(","));
  return [header.join(","), ...rows].join("\n");
}

function downloadCsv(audit: Audit) {
  const content = audit.csv_data && audit.csv_data.length > 0 ? audit.csv_data : toCsv(audit);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dt = new Date(audit.created_at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.download = `auditoria_pdf_${dt}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EstoqueAuditoriaPDF() {
  const { store, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState("");
  const [pasted, setPasted] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    if (!store?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("pdf_sync_audits")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data as any) || []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store?.id]);

  const totals = useMemo(() => {
    const t = { syncs: items.length, divergencias: 0, ok: 0, itens: 0 };
    items.forEach(i => { t.divergencias += i.divergences_count; t.ok += i.ok_count; t.itens += i.total_pdf_items; });
    return t;
  }, [items]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    toast.info("Para parsear PDFs do Bling, peça ao chat para sincronizar. O upload aqui apenas registra a auditoria manual.");
  }

  async function recordManual() {
    if (!store?.id) return;
    if (!filename.trim()) { toast.error("Informe o nome do arquivo PDF."); return; }
    // parse pasted CSV: sku,name,pdf_qty,db_qty,diff
    const lines = pasted.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const divergences = lines.slice(lines[0]?.toLowerCase().includes("sku") ? 1 : 0).map(l => {
      const [sku, name, pdf_qty, db_qty, diff, reason] = l.split(",");
      return { sku: (sku||"").trim(), name: (name||"").trim(), pdf_qty: Number(pdf_qty||0), db_qty: Number(db_qty||0), diff: Number(diff||0), reason: (reason||"").trim() };
    });
    const { error } = await supabase.from("pdf_sync_audits").insert({
      store_id: store.id,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      filename: filename.trim(),
      total_pdf_items: 0, total_db_items: 0, ok_count: 0,
      inserted_count: 0, updated_count: 0,
      divergences_count: divergences.length,
      total_units_pdf: 0, total_units_db: 0,
      divergences,
      csv_data: pasted || null,
      notes: "Registro manual via UI",
    });
    if (error) { toast.error(error.message); return; }
    // gerar alerta se houver divergência
    if (divergences.length > 0) {
      await supabase.from("alerts").insert({
        store_id: store.id,
        type: "pdf_sync_divergence",
        severity: "warning",
        title: `Divergências de PDF: ${divergences.length} SKU(s)`,
        message: `Auditoria de ${filename} registrou divergência de quantidade. Revise e aplique a correção.`,
        link: "/painel/estoque/auditoria-pdf",
      });
    }
    setFilename(""); setPasted("");
    toast.success("Auditoria registrada.");
    load();
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title="Auditoria de Sincronização PDF"
        description="Histórico de cada importação de PDF · contagens · divergências · CSV"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/painel/estoque/relatorios")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
            <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3"><div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Sincronizações</div><div className="text-2xl font-bold mt-1">{totals.syncs}</div></Card>
        <Card className="p-3"><div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Itens conferidos</div><div className="text-2xl font-bold mt-1">{totals.itens}</div></Card>
        <Card className="p-3"><div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">OK</div><div className="text-2xl font-bold mt-1 text-success">{totals.ok}</div></Card>
        <Card className="p-3"><div className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">Divergências</div><div className={`text-2xl font-bold mt-1 ${totals.divergencias>0?"text-danger":""}`}>{totals.divergencias}</div></Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="font-semibold text-sm">Registrar auditoria manual</h2></div>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Arquivo PDF</Label>
            <div className="flex gap-2 mt-1">
              <Input value={filename} onChange={e => setFilename(e.target.value)} placeholder="ex: estoque_26_06.pdf" />
              <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /></Button>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Divergências (CSV: sku,nome,qty_pdf,qty_db,diff,obs)</Label>
            <textarea
              className="w-full mt-1 h-20 rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              placeholder="COL13P,CAPINHA SPACE COLLECTION IPHONE 13 PRO,11.5,11,0.5,arredondamento"
            />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <Button onClick={recordManual} className="bg-gradient-primary"><FileText className="h-4 w-4 mr-1" /> Registrar</Button>
        </div>
      </Card>

      <Card className="divide-y">
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div>}
        {!loading && items.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma auditoria registrada ainda.</div>}
        {items.map(a => (
          <div key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium truncate">{a.filename}</span>
                  {a.divergences_count > 0
                    ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {a.divergences_count} divergência(s)</Badge>
                    : <Badge className="bg-success/15 text-success gap-1"><CheckCircle2 className="h-3 w-3" /> 100% OK</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(a.created_at).toLocaleString("pt-BR")} · {a.user_email || "—"} · PDF {a.total_pdf_items} / DB {a.total_db_items} · {Number(a.total_units_pdf).toLocaleString("pt-BR")} un. PDF · {Number(a.total_units_db).toLocaleString("pt-BR")} un. DB
                </div>
                {a.notes && <div className="text-xs text-muted-foreground mt-1 italic">{a.notes}</div>}
              </div>
              <Button size="sm" variant="outline" onClick={() => downloadCsv(a)}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            </div>
            {a.divergences_count > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground"><tr className="border-b"><th className="text-left py-1 pr-2">SKU</th><th className="text-left py-1 pr-2">Produto</th><th className="text-right py-1 pr-2">PDF</th><th className="text-right py-1 pr-2">DB</th><th className="text-right py-1 pr-2">Δ</th><th className="text-left py-1">Observação</th></tr></thead>
                  <tbody>
                    {a.divergences.map((d, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-2 font-mono">{d.sku}</td>
                        <td className="py-1 pr-2 truncate max-w-[260px]">{d.name}</td>
                        <td className="py-1 pr-2 text-right">{d.pdf_qty}</td>
                        <td className="py-1 pr-2 text-right">{d.db_qty}</td>
                        <td className={`py-1 pr-2 text-right font-medium ${d.diff !== 0 ? "text-danger" : ""}`}>{d.diff > 0 ? "+" : ""}{d.diff}</td>
                        <td className="py-1 text-muted-foreground">{d.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}