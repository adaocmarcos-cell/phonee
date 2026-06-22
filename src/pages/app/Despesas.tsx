import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth, canSeeCost } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Download, Paperclip, Wallet, TrendingUp, Calendar,
  FileDown, FileSpreadsheet, FileText as FileTextIcon,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Legend,
} from "recharts";

const PAY_METHODS = ["PIX", "Dinheiro", "Cartão de Débito", "Cartão de Crédito", "Boleto", "Transferência", "Outros"];
const COLOR_PALETTE = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#6B7280"];

type Category = { id: string; name: string; color: string | null; icon: string | null; is_system: boolean; store_id: string | null };
type Expense = {
  id: string; category_id: string | null; category_name: string; subcategory: string | null;
  description: string; amount: number; expense_date: string; payment_method: string;
  cost_center: string | null; notes: string | null; receipt_url: string | null; created_at: string;
};

const sb = supabase as any;

export default function Despesas() {
  const { store, role } = useAuth();
  const isAdmin = role === "dono" || role === "gerente";
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodMonths, setPeriodMonths] = useState("12");
  const [filterCat, setFilterCat] = useState<string>("all");

  const [openNew, setOpenNew] = useState(false);
  const [openCat, setOpenCat] = useState(false);

  const reload = async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: cats }, { data: exps }] = await Promise.all([
      sb.from("expense_categories")
        .select("*")
        .or(`is_system.eq.true,store_id.eq.${store.id}`)
        .order("name"),
      sb.from("expenses")
        .select("*")
        .eq("store_id", store.id)
        .order("expense_date", { ascending: false })
        .limit(500),
    ]);
    setCategories(cats ?? []);
    setExpenses(exps ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [store]);

  const filtered = useMemo(() => {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - Number(periodMonths));
    return expenses.filter((e) => new Date(e.expense_date) >= cutoff && (filterCat === "all" || e.category_id === filterCat));
  }, [expenses, periodMonths, filterCat]);

  const totalMonth = useMemo(() => {
    const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return expenses.filter((e) => new Date(e.expense_date) >= monthStart).reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses]);

  const totalYear = useMemo(() => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    return expenses.filter((e) => new Date(e.expense_date) >= yearStart).reduce((s, e) => s + Number(e.amount), 0);
  }, [expenses]);

  const byCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number; color: string }> = {};
    filtered.forEach((e) => {
      const cat = categories.find((c) => c.id === e.category_id);
      const k = e.category_name;
      if (!map[k]) map[k] = { name: k, total: 0, color: cat?.color ?? "#2563EB" };
      map[k].total += Number(e.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, categories]);

  const byMonth = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      const d = new Date(e.expense_date);
      const k = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      map[k] = (map[k] || 0) + Number(e.amount);
    });
    return Object.entries(map).map(([month, total]) => ({ month, total })).reverse();
  }, [filtered]);

  const removeExpense = async (id: string) => {
    const { error } = await sb.from("expenses").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Despesa removida" });
    reload();
  };

  const exportCSV = () => {
    const headers = ["Data", "Categoria", "Subcategoria", "Descrição", "Valor", "Pagamento", "Centro de custo", "Observações"];
    const rows = filtered.map((e) => [
      e.expense_date, e.category_name, e.subcategory ?? "", e.description,
      Number(e.amount).toFixed(2), e.payment_method, e.cost_center ?? "", (e.notes ?? "").replace(/\n/g, " "),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`despesas-${Date.now()}.csv`, "text/csv;charset=utf-8;", "\uFEFF" + csv);
  };

  const exportXLSX = () => {
    // Simple SpreadsheetML 2003 XML readable by Excel
    const rows = filtered.map((e) => `<Row>
      <Cell><Data ss:Type="String">${e.expense_date}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(e.category_name)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(e.subcategory ?? "")}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(e.description)}</Data></Cell>
      <Cell><Data ss:Type="Number">${Number(e.amount).toFixed(2)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(e.payment_method)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(e.cost_center ?? "")}</Data></Cell>
    </Row>`).join("");
    const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Despesas"><Table>
<Row><Cell><Data ss:Type="String">Data</Data></Cell><Cell><Data ss:Type="String">Categoria</Data></Cell><Cell><Data ss:Type="String">Subcategoria</Data></Cell><Cell><Data ss:Type="String">Descrição</Data></Cell><Cell><Data ss:Type="String">Valor</Data></Cell><Cell><Data ss:Type="String">Pagamento</Data></Cell><Cell><Data ss:Type="String">Centro de custo</Data></Cell></Row>
${rows}
</Table></Worksheet></Workbook>`;
    download(`despesas-${Date.now()}.xls`, "application/vnd.ms-excel", xml);
  };

  const exportPDF = () => {
    const win = window.open("", "_blank"); if (!win) return;
    const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
    win.document.write(`<html><head><title>Relatório de Despesas</title>
<style>body{font-family:Inter,system-ui,sans-serif;padding:24px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f4f4f5}.t{text-align:right}.total{margin-top:16px;font-weight:700;font-size:14px}</style>
</head><body>
<h1>Relatório de Despesas</h1>
<div>Loja: ${escapeXml(store?.name ?? "")} · Período: últimos ${periodMonths} meses · Gerado em ${new Date().toLocaleString("pt-BR")}</div>
<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Pagamento</th><th class="t">Valor</th></tr></thead><tbody>
${filtered.map((e) => `<tr><td>${new Date(e.expense_date).toLocaleDateString("pt-BR")}</td><td>${escapeXml(e.category_name)}</td><td>${escapeXml(e.description)}</td><td>${escapeXml(e.payment_method)}</td><td class="t">${brl(Number(e.amount))}</td></tr>`).join("")}
</tbody></table>
<div class="total">Total: ${brl(total)}</div>
<script>window.onload=()=>window.print();</script>
</body></html>`);
    win.document.close();
  };

  if (!store) return null;

  return (
    <div>
      <PageHeader
        title="Custos & Despesas"
        description="Controle todos os gastos fixos e variáveis da sua loja."
        actions={
          <>
            {isAdmin && (
              <Dialog open={openCat} onOpenChange={setOpenCat}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Plus className="h-4 w-4 mr-1" /> Nova Categoria</Button>
                </DialogTrigger>
                <NewCategoryDialog storeId={store.id} onDone={() => { setOpenCat(false); reload(); }} />
              </Dialog>
            )}
            <Dialog open={openNew} onOpenChange={setOpenNew}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" /> Lançar Despesa</Button>
              </DialogTrigger>
              <NewExpenseDialog
                storeId={store.id}
                categories={categories}
                onDone={() => { setOpenNew(false); reload(); }}
              />
            </Dialog>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 bg-primary text-primary-foreground border-primary shadow-glow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-widest font-mono opacity-85">Total do mês</span>
            <Wallet className="h-5 w-5" />
          </div>
          <div className="metric text-4xl font-bold">{brl(totalMonth)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Total do ano</span>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="metric text-3xl font-bold">{brl(totalYear)}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">Lançamentos</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="metric text-3xl font-bold">{expenses.length}</div>
        </Card>
      </div>

      <Tabs defaultValue="lancamentos">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <TabsList>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
            <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
          </TabsList>
          <div className="flex gap-2 items-center">
            <Select value={periodMonths} onValueChange={setPeriodMonths}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Último mês</SelectItem>
                <SelectItem value="3">Últimos 3 meses</SelectItem>
                <SelectItem value="6">Últimos 6 meses</SelectItem>
                <SelectItem value="12">Últimos 12 meses</SelectItem>
                <SelectItem value="36">Últimos 3 anos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="lancamentos">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="text-sm text-muted-foreground">
                {filtered.length} lançamento(s) · Total: <span className="font-semibold text-foreground">{brl(filtered.reduce((s, e) => s + Number(e.amount), 0))}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={exportCSV}><FileDown className="h-4 w-4 mr-1" />CSV</Button>
                <Button size="sm" variant="outline" onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
                <Button size="sm" variant="outline" onClick={exportPDF}><FileTextIcon className="h-4 w-4 mr-1" />PDF</Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhuma despesa neste período.</TableCell></TableRow>
                ) : filtered.map((e) => {
                  const cat = categories.find((c) => c.id === e.category_id);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{new Date(e.expense_date).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal" style={{ borderColor: cat?.color ?? undefined, color: cat?.color ?? undefined }}>
                          {e.category_name}
                        </Badge>
                        {e.subcategory && <div className="text-xs text-muted-foreground mt-0.5">{e.subcategory}</div>}
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        <div className="truncate">{e.description}</div>
                        {e.receipt_url && (
                          <a href={e.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                            <Paperclip className="h-3 w-3" /> Comprovante
                          </a>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{e.payment_method}</TableCell>
                      <TableCell className="text-right metric font-semibold">{brl(Number(e.amount))}</TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-danger"><Trash2 className="h-4 w-4" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir despesa?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeExpense(e.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="relatorios">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-semibold mb-4">Gastos por categoria</h3>
              <div className="h-72">
                {byCategory.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={byCategory} dataKey="total" nameKey="name" innerRadius={50} outerRadius={95} paddingAngle={2}>
                        {byCategory.map((c, i) => <Cell key={i} fill={c.color || COLOR_PALETTE[i % COLOR_PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-semibold mb-4">Evolução mensal</h3>
              <div className="h-72">
                {byMonth.length === 0 ? <Empty /> : (
                  <ResponsiveContainer>
                    <BarChart data={byMonth}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card className="p-5 lg:col-span-2">
              <h3 className="font-semibold mb-4">Ranking das maiores despesas</h3>
              <div className="space-y-2">
                {byCategory.slice(0, 10).map((c, i) => {
                  const max = byCategory[0]?.total || 1;
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className="text-xs font-mono text-muted-foreground w-6">#{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate">{c.name}</span>
                          <span className="font-semibold">{brl(c.total)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(c.total / max) * 100}%`, background: c.color }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                {byCategory.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sem dados.</p>}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="categorias">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_system ? "secondary" : "outline"}>{c.is_system ? "Padrão" : "Personalizada"}</Badge>
                    </TableCell>
                    <TableCell><div className="h-5 w-5 rounded" style={{ background: c.color || "#999" }} /></TableCell>
                    <TableCell className="text-right">
                      {!c.is_system && isAdmin && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" onClick={async () => {
                          if (!confirm("Excluir categoria?")) return;
                          await sb.from("expense_categories").delete().eq("id", c.id);
                          reload();
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty() {
  return <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-mono tracking-widest">SEM DADOS</div>;
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function NewCategoryDialog({ storeId, onDone }: { storeId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [icon, setIcon] = useState("Receipt");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast({ title: "Informe o nome", variant: "destructive" });
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await sb.from("expense_categories").insert({
      store_id: storeId, name: name.trim(), description: description.trim() || null,
      color, icon, is_system: false, created_by: u.user?.id,
    });
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Categoria criada" });
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Marketing digital" />
        </div>
        <div>
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div>
          <Label>Ícone (nome lucide)</Label>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="Receipt" />
        </div>
        <div>
          <Label>Cor</Label>
          <div className="flex gap-2 mt-2">
            {COLOR_PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-md border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewExpenseDialog({ storeId, categories, onDone }: { storeId: string; categories: Category[]; onDone: () => void }) {
  const [categoryId, setCategoryId] = useState<string>("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState(PAY_METHODS[0]);
  const [costCenter, setCostCenter] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedCat = categories.find((c) => c.id === categoryId);
  const isOther = selectedCat?.name === "Outros";

  const save = async () => {
    if (!categoryId) return toast({ title: "Selecione a categoria", variant: "destructive" });
    if (!description.trim()) return toast({ title: "Descreva a despesa", variant: "destructive" });
    if (!amount || Number(amount) <= 0) return toast({ title: "Valor inválido", variant: "destructive" });

    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id;

    let receipt_url: string | null = null;
    if (file) {
      const path = `${storeId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("expense-receipts").upload(path, file);
      if (upErr) { setSaving(false); return toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" }); }
      const { data: signed } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
      receipt_url = signed?.signedUrl ?? null;
    }

    const { error } = await sb.from("expenses").insert({
      store_id: storeId, category_id: categoryId, category_name: selectedCat?.name ?? "Outros",
      subcategory: subcategory.trim() || null, description: description.trim(),
      amount: Number(amount), expense_date: date, payment_method: paymentMethod,
      cost_center: costCenter.trim() || null, notes: notes.trim() || null,
      receipt_url, created_by: userId,
    });
    setSaving(false);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Despesa lançada" });
    onDone();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Lançar nova despesa</DialogTitle></DialogHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Categoria *</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Escolha…" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{!c.is_system && " (personalizada)"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subcategoria</Label>
          <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
        </div>
        <div>
          <Label>Centro de custo</Label>
          <Input value={costCenter} onChange={(e) => setCostCenter(e.target.value)} placeholder="Ex: Loja Centro" />
        </div>
        <div className="sm:col-span-2">
          <Label>{isOther ? "Descreva a despesa *" : "Descrição *"}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isOther ? "Ex: Almoço com cliente, troca de lâmpadas…" : "Detalhe da despesa"} />
        </div>
        <div>
          <Label>Valor (R$) *</Label>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Forma de pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Anexar comprovante</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Lançar despesa"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}