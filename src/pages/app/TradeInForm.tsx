import { useEffect, useRef, useState, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Upload, Trash2, ShieldCheck, ShieldAlert, Plus, Smartphone, Check, X, Wrench, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const CHECKLIST_ITEMS = [
  { key: "screen_ok", label: "Tela sem trincas ou manchas" },
  { key: "battery_ok", label: "Bateria saudável" },
  { key: "cam_back_ok", label: "Câmera traseira funcionando" },
  { key: "cam_front_ok", label: "Câmera frontal funcionando" },
  { key: "buttons_ok", label: "Botões físicos OK" },
  { key: "biometric_ok", label: "Face ID / Digital OK" },
  { key: "box_included", label: "Caixinha original inclusa" },
  { key: "accessories_included", label: "Acessórios inclusos" },
  { key: "icloud_removed", label: "Conta Google/iCloud removida" },
  { key: "no_mdm", label: "Sem bloqueio MDM" },
  { key: "body_ok", label: "Sem danos na lateral/traseira" },
  { key: "speaker_ok", label: "Alto-falante e microfone OK" },
];

type TradeIn = any;
type RepairPart = { part_id: string | null; name: string; qty: number; unit_cost: number; applied?: boolean };
type CheckState = "ok" | "defeito" | null;

function cycleCheck(v: CheckState): CheckState {
  if (!v) return "ok";
  if (v === "ok") return "defeito";
  return null;
}

export default function TradeInForm() {
  const { id } = useParams();
  const editing = !!id;
  const { store, user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState<TradeIn>({
    customer_name: "", customer_doc: "", customer_phone: "", customer_email: "",
    imei: "", imei_status: "nao_verificado",
    brand: "", model: "", storage_gb: "", color: "",
    condition: "bom", battery_health: 100,
    entry_value: 0, repair_costs: 0, intended_sale_value: 0,
    checklist: {} as Record<string, CheckState>,
    repair_parts: [] as RepairPart[],
    photos_in: [] as string[],
    notes: "", status: "em_avaliacao",
    add_to_stock: false,
    scrap_for_parts: false,
  });
  const [pendingDevices, setPendingDevices] = useState<TradeIn[]>([]);
  const [partsCatalog, setPartsCatalog] = useState<any[]>([]);
  const [partDialogOpen, setPartDialogOpen] = useState(false);
  const [selPartId, setSelPartId] = useState<string>("");
  const [selPartQty, setSelPartQty] = useState<number>(0);
  const originalStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editing || !store) return;
    (async () => {
      const { data } = await supabase.from("trade_ins").select("*").eq("id", id).maybeSingle();
      if (data) setForm({
        ...data,
        checklist: data.checklist ?? {},
        photos_in: data.photos_in ?? [],
        repair_parts: (data as any).repair_parts ?? [],
        repair_costs: (data as any).repair_costs ?? 0,
        scrap_for_parts: (data as any).scrap_for_parts ?? false,
      });
      if (data) originalStatusRef.current = (data as any).status;
    })();
  }, [id, editing, store]);

  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data } = await supabase
        .from("parts_inventory")
        .select("id,name,sku,cost_price,stock_current")
        .eq("store_id", store.id)
        .order("name");
      setPartsCatalog(data || []);
    })();
  }, [store]);

  const update = (patch: Partial<TradeIn>) => setForm((f: TradeIn) => ({ ...f, ...patch }));
  const toggleCheck = (k: string) =>
    setForm((f: TradeIn) => ({ ...f, checklist: { ...f.checklist, [k]: cycleCheck(f.checklist[k] ?? null) } }));

  const recomputeRepairCost = (parts: RepairPart[], manualExtra = 0) =>
    parts.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.unit_cost) || 0), 0) + manualExtra;

  const addRepairPart = () => {
    const p = partsCatalog.find((x) => x.id === selPartId);
    if (!p) return toast.error("Selecione uma peça.");
    if (selPartQty <= 0) return toast.error("Quantidade inválida.");
    if ((p.stock_current ?? 0) < selPartQty) return toast.error("Estoque insuficiente para essa peça.");
    const item: RepairPart = {
      part_id: p.id, name: p.name, qty: selPartQty, unit_cost: Number(p.cost_price) || 0, applied: false,
    };
    const newParts = [...(form.repair_parts || []), item];
    update({
      repair_parts: newParts,
      repair_costs: Number(form.repair_costs || 0) + item.qty * item.unit_cost,
    });
    setSelPartId(""); setSelPartQty(0); setPartDialogOpen(false);
  };

  const removeRepairPart = (idx: number) => {
    const item = form.repair_parts[idx];
    if (item.applied) {
      return toast.error("Peça já baixada do estoque. Faça um ajuste manual de estoque se necessário.");
    }
    const next = form.repair_parts.filter((_: any, i: number) => i !== idx);
    update({
      repair_parts: next,
      repair_costs: Math.max(0, Number(form.repair_costs || 0) - item.qty * item.unit_cost),
    });
  };

  const checkImei = () => {
    if (!form.imei || form.imei.length < 14) return toast.error("Informe um IMEI válido (15 dígitos).");
    // Mock check — flag suspicious if ends in 000
    const suspicious = form.imei.endsWith("000");
    update({ imei_status: suspicious ? "restrito" : "limpo" });
    toast.success(suspicious ? "IMEI marcado como restrito ⚠️" : "IMEI limpo ✅");
  };

  const uploadPhoto = async (file: File) => {
    if (!store) return;
    setUploading(true);
    const path = `${store.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error } = await supabase.storage.from("trade-in-photos").upload(path, file, { upsert: false });
    if (error) { setUploading(false); return toast.error(error.message); }
    update({ photos_in: [...form.photos_in, path] });
    setUploading(false);
  };

  const photoUrl = (path: string) => {
    const { data } = supabase.storage.from("trade-in-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  const removePhoto = async (path: string) => {
    await supabase.storage.from("trade-in-photos").remove([path]);
    update({ photos_in: form.photos_in.filter((p: string) => p !== path) });
  };

  const buildPayload = (src: TradeIn) => ({
    store_id: store!.id,
    created_by: user!.id,
    customer_name: src.customer_name.trim(),
    customer_doc: src.customer_doc || null,
    customer_phone: src.customer_phone || null,
    customer_email: src.customer_email || null,
    imei: src.imei || null,
    imei_status: src.imei_status,
    brand: src.brand || null,
    model: src.model.trim(),
    storage_gb: src.storage_gb || null,
    color: src.color || null,
    condition: src.condition,
    battery_health: Number(src.battery_health) || null,
    entry_value: Number(src.entry_value) || 0,
    repair_costs: Number(src.repair_costs) || 0,
    scrap_for_parts: !!src.scrap_for_parts,
    repair_parts: (src.repair_parts || []).map((p: RepairPart) => ({ ...p, applied: true })),
    intended_sale_value: Number(src.intended_sale_value) || 0,
    checklist: src.checklist,
    photos_in: src.photos_in,
    notes: src.notes || null,
    // If "include in stock now" is checked (and not scrap), send straight to em_estoque so the trigger creates a product
    status: src.scrap_for_parts ? (src.status === "em_avaliacao" ? "em_estoque" : src.status)
          : src.add_to_stock ? "em_estoque" : src.status,
  });

  const resetDeviceFields = () =>
    setForm((f: TradeIn) => ({
      ...f,
      imei: "", imei_status: "nao_verificado",
      brand: "", model: "", storage_gb: "", color: "",
      condition: "bom", battery_health: 100,
      entry_value: 0, repair_costs: 0, intended_sale_value: 0,
      checklist: {},
      repair_parts: [],
      photos_in: [],
      notes: "",
      add_to_stock: false,
      scrap_for_parts: false,
    }));

  const addAnother = () => {
    if (!form.model.trim()) return toast.error("Preencha o modelo antes de adicionar outro.");
    setPendingDevices((arr) => [...arr, { ...form }]);
    toast.success("Aparelho adicionado à entrega. Preencha o próximo.");
    resetDeviceFields();
  };

  const removePending = (idx: number) =>
    setPendingDevices((arr) => arr.filter((_, i) => i !== idx));

  // Repair side-effects (regime de competência):
  //  - Dá baixa das peças usadas no reparo em parts_inventory.
  //  - Se o aparelho já virou produto (product_id preenchido), soma o custo das
  //    peças ao products.cost_price. NUNCA cria despesa — o custo entra no CMV
  //    quando o aparelho for vendido.
  const applyRepairSideEffects = async (src: TradeIn) => {
    if (!store) return;
    const newParts: RepairPart[] = (src.repair_parts || []).filter((p: RepairPart) => p.part_id && !p.applied);
    if (newParts.length === 0) return;
    for (const p of newParts) {
      const cur = partsCatalog.find((x) => x.id === p.part_id);
      const newStock = Math.max(0, (cur?.stock_current ?? 0) - (p.qty || 0));
      await supabase.from("parts_inventory").update({ stock_current: newStock }).eq("id", p.part_id);
    }
    // O trigger tradein_sync_product_cost cuida do custo do produto ao salvar
    // a ficha com o novo repair_costs, então não precisamos escrever em products aqui.
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!store || !user) return;
    if (!form.customer_name.trim()) return toast.error("Informe o nome do cliente.");
    if (!form.model.trim() && pendingDevices.length === 0)
      return toast.error("Informe o modelo do aparelho ou adicione pelo menos um aparelho.");

    // Validations + clear warnings on status changes (recusado / vendido)
    if (editing && originalStatusRef.current && originalStatusRef.current !== form.status) {
      if (form.status === "recusado") {
        const ok = window.confirm(
          "Marcar como RECUSADO devolve o aparelho ao cliente e remove a entrada do estoque ativo. " +
          "O lançamento financeiro de entrada será estornado. Deseja continuar?"
        );
        if (!ok) return;
      }
      if (form.status === "vendido") {
        const ok = window.confirm(
          "Marcar como VENDIDO aqui apenas atualiza o status da ficha. " +
          "Para registrar a receita corretamente, finalize a venda pelo módulo Vendas. Continuar?"
        );
        if (!ok) return;
      }
    }

    setBusy(true);

    if (editing) {
      const { error } = await supabase.from("trade_ins").update(buildPayload(form)).eq("id", id!);
      if (error) return toast.error(error.message);
      await applyRepairSideEffects(form);
      setBusy(false);
      toast.success("Ficha atualizada");
      navigate("/painel/troca");
      return;
    }

    const all = form.model.trim() ? [...pendingDevices, form] : pendingDevices;
    const payloads = all.map(buildPayload);
    const { data: inserted, error } = await supabase.from("trade_ins").insert(payloads).select("id");
    if (error) return toast.error(error.message);
    for (let i = 0; i < all.length; i++) {
      const d = all[i];
      await applyRepairSideEffects(d);
    }
    setBusy(false);
    toast.success(`${payloads.length} ficha(s) criada(s)`);
    navigate("/painel/troca");
  };

  const totalCost = Number(form.entry_value || 0) + Number(form.repair_costs || 0);
  const margin = form.intended_sale_value > 0
    ? ((form.intended_sale_value - totalCost) / form.intended_sale_value) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={editing ? "Editar entrada de Compra & Troca" : "Lançar entrada de Compra & Troca"}
        description="Controle de entrada de aparelhos usados. A saída sempre será registrada como Venda."
        actions={<Button variant="ghost" onClick={() => navigate("/painel/troca")}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>}
      />

      <form onSubmit={save} className="space-y-6">
        {/* Cliente */}
        <Card className="p-5 bg-card border-border">
          <h3 className="font-semibold mb-1">Dono anterior (cliente)</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Estes dados ficam registrados como histórico de procedência do aparelho.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.customer_name} onChange={(e) => update({ customer_name: e.target.value })} /></div>
            <div className="space-y-2"><Label>CPF/CNPJ</Label><Input value={form.customer_doc} onChange={(e) => update({ customer_doc: e.target.value })} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={form.customer_phone} onChange={(e) => update({ customer_phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={form.customer_email} onChange={(e) => update({ customer_email: e.target.value })} /></div>
          </div>
        </Card>

        {/* Aparelho */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-semibold">Aparelho{!editing && pendingDevices.length > 0 ? ` ${pendingDevices.length + 1}` : ""}</h3>
            {!editing && (
              <Button type="button" variant="outline" size="sm" onClick={addAnother}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar outro aparelho a esta entrega
              </Button>
            )}
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Marca</Label><Input value={form.brand} onChange={(e) => update({ brand: e.target.value })} placeholder="Apple, Samsung…" /></div>
            <div className="space-y-2 md:col-span-2"><Label>Modelo *</Label><Input value={form.model} onChange={(e) => update({ model: e.target.value })} placeholder="iPhone 14 Pro 256GB" /></div>
            <div className="space-y-2"><Label>Armazenamento</Label><Input value={form.storage_gb} onChange={(e) => update({ storage_gb: e.target.value })} placeholder="128 GB" /></div>
            <div className="space-y-2"><Label>Cor</Label><Input value={form.color} onChange={(e) => update({ color: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Condição</Label>
              <Select value={form.condition} onValueChange={(v) => update({ condition: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="otimo">Ótimo</SelectItem>
                  <SelectItem value="bom">Bom</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="com_defeito">Com defeito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>IMEI</Label>
              <div className="flex gap-2">
                <Input value={form.imei} onChange={(e) => update({ imei: e.target.value, imei_status: "nao_verificado" })} placeholder="15 dígitos" className="font-mono" />
                <Button type="button" variant="outline" onClick={checkImei}>Consultar</Button>
              </div>
              {form.imei_status === "limpo" && <Badge className="bg-success/15 text-success border-success/30"><ShieldCheck className="h-3 w-3 mr-1" />IMEI limpo</Badge>}
              {form.imei_status === "restrito" && <Badge className="bg-danger/15 text-danger border-danger/30"><ShieldAlert className="h-3 w-3 mr-1" />IMEI com restrição</Badge>}
            </div>
            <div className="space-y-2"><Label>Saúde da bateria (%)</Label><NumberInput allowDecimal={false} min={0} value={Number(form.battery_health) || 0} onValueChange={(n) => update({ battery_health: String(Math.min(100, n)) })} className="font-mono" /></div>
            <div className="space-y-2"><Label>Valor pago ao cliente (R$)</Label><NumberInput emptyBehavior="zero" min={0} value={Number(form.entry_value) || 0} onValueChange={(n) => update({ entry_value: n })} placeholder="0,00" className="font-mono" /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5" /> Custos de reparo (R$)</Label>
                <button type="button" onClick={() => setPartDialogOpen(true)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Vincular peça
                </button>
              </div>
              <NumberInput emptyBehavior="zero" min={0} value={Number(form.repair_costs) || 0} onValueChange={(n) => update({ repair_costs: n })} placeholder="0,00" className="font-mono" />
              {form.repair_parts?.length > 0 && (
                <div className="space-y-1 pt-1">
                  {form.repair_parts.map((p: RepairPart, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-surface-elevated border border-border">
                      <span className="truncate">{p.qty}× {p.name} · R$ {(p.qty * p.unit_cost).toFixed(2)}{p.applied && <span className="text-success ml-1">✓</span>}</span>
                      {!p.applied && (
                        <button type="button" onClick={() => removeRepairPart(i)} className="text-danger hover:opacity-80"><Trash2 className="h-3 w-3" /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2"><Label>Valor de venda pretendido (R$)</Label><NumberInput emptyBehavior="zero" min={0} value={Number(form.intended_sale_value) || 0} onValueChange={(n) => update({ intended_sale_value: n })} placeholder="0,00" className="font-mono" /></div>
            <div className="space-y-2"><Label>Margem estimada</Label><div className={`px-3 py-2 rounded-md border border-border bg-surface-elevated font-mono font-semibold ${margin >= 25 ? "text-success" : margin >= 10 ? "text-warning" : "text-danger"}`}>{margin.toFixed(1)}%</div></div>
          </div>

          {!editing && (
            <div className="mt-4 grid md:grid-cols-2 gap-3">
              <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-surface-elevated/50 cursor-pointer">
                <Checkbox checked={!!form.add_to_stock} onCheckedChange={(v) => update({ add_to_stock: !!v, scrap_for_parts: v ? false : form.scrap_for_parts })} disabled={form.scrap_for_parts} />
                <div className="text-sm">
                  <div className="font-medium">Incluir agora no estoque</div>
                  <div className="text-xs text-muted-foreground">Quando marcado, este aparelho entra direto como seminovo disponível para venda. Caso contrário, fica em avaliação.</div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-surface-elevated/50 cursor-pointer">
                <Checkbox checked={!!form.scrap_for_parts} onCheckedChange={(v) => update({ scrap_for_parts: !!v, add_to_stock: v ? false : form.add_to_stock })} disabled={form.add_to_stock} />
                <div className="text-sm">
                  <div className="font-medium">Incluir como sucata e retirada de peças</div>
                  <div className="text-xs text-muted-foreground">O aparelho não entra na vitrine. Será destinado à canibalização para reaproveitamento de peças.</div>
                </div>
              </label>
            </div>
          )}
        </Card>

        {!editing && pendingDevices.length > 0 && (
          <Card className="p-5 bg-primary/5 border-primary/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                Aparelhos nesta entrega ({pendingDevices.length})
              </h3>
              <span className="text-[11px] text-muted-foreground">Serão salvos junto ao apertar "Criar fichas".</span>
            </div>
            <div className="space-y-2">
              {pendingDevices.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-card border border-border">
                  <div className="text-sm">
                    <span className="font-medium">{d.brand ? `${d.brand} ` : ""}{d.model}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {d.storage_gb ? `${d.storage_gb} · ` : ""}{d.color || "—"} · entrada R$ {Number(d.entry_value || 0).toFixed(2)}
                      {d.add_to_stock && <Badge className="ml-2 bg-success/15 text-success border-success/30 text-[10px]">vai p/ estoque</Badge>}
                    </span>
                  </div>
                  <Button type="button" size="icon" variant="ghost" onClick={() => removePending(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Checklist */}
        <Card className="p-5 bg-card border-border">
          <h3 className="font-semibold mb-1">Checklist de avaliação</h3>
          <p className="text-xs text-muted-foreground mb-4">Toque para alternar: <span className="text-success font-medium">verde = OK</span> · <span className="text-danger font-medium">vermelho = com defeito</span>.</p>
          <div className="grid md:grid-cols-2 gap-2">
            {CHECKLIST_ITEMS.map((item) => {
              const st: CheckState = form.checklist[item.key] ?? null;
              const cls = st === "ok"
                ? "border-success/60 bg-success/10"
                : st === "defeito"
                ? "border-danger/60 bg-danger/10"
                : "border-border hover:bg-surface-elevated/40";
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => toggleCheck(item.key)}
                  className={`flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${cls}`}
                >
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    st === "ok" ? "bg-success text-success-foreground" :
                    st === "defeito" ? "bg-danger text-danger-foreground" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {st === "ok" ? <Check className="h-3 w-3" /> : st === "defeito" ? <X className="h-3 w-3" /> : "—"}
                  </span>
                  <span className="text-sm flex-1">{item.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-5 space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => update({ notes: e.target.value })} rows={3} placeholder="Anote detalhes adicionais da avaliação…" />
          </div>
        </Card>

        {/* Fotos */}
        <Card className="p-5 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Fotos de entrada</h3>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-1" /> {uploading ? "Enviando…" : "Adicionar foto"}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </div>
          {form.photos_in.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma foto enviada. Recomendado: frente, verso, laterais e detalhes de danos.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {form.photos_in.map((p: string) => (
                <div key={p} className="relative group rounded-md overflow-hidden border border-border bg-surface-elevated aspect-square">
                  <img src={photoUrl(p)} alt="Foto do aparelho" className="w-full h-full object-cover" loading="lazy" />
                  <button type="button" onClick={() => removePhoto(p)} className="absolute top-2 right-2 p-1.5 rounded-md bg-danger/90 text-danger-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Status + observações */}
        <Card className="p-5 bg-card border-border">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status da entrada</Label>
              <Select value={form.status} onValueChange={(v) => update({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_avaliacao">Em avaliação</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="em_estoque">Em estoque</SelectItem>
                  <SelectItem value="vendido">Vendido</SelectItem>
                  <SelectItem value="recusado">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate("/painel/troca")}>Cancelar</Button>
          <Button type="submit" disabled={busy} className="bg-gradient-primary shadow-glow">
            {busy ? "Salvando…" : editing ? "Salvar alterações" : pendingDevices.length > 0 ? `Lançar ${pendingDevices.length + (form.model.trim() ? 1 : 0)} entradas` : "Lançar entrada"}
          </Button>
        </div>
      </form>

      {/* Dialog: vincular peça do estoque */}
      <Dialog open={partDialogOpen} onOpenChange={setPartDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular peça do estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Peça</Label>
              <Select value={selPartId} onValueChange={setSelPartId}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>
                  {partsCatalog.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma peça em estoque.</div>}
                  {partsCatalog.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={(p.stock_current ?? 0) <= 0}>
                      {p.name} · estoque {p.stock_current ?? 0} · R$ {Number(p.cost_price || 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <NumberInput allowDecimal={false} min={0} emptyBehavior="zero" value={selPartQty} onValueChange={setSelPartQty} className="font-mono" />
            </div>
            <p className="text-[11px] text-muted-foreground">O custo da peça (qtd × custo) será somado aos custos de reparo. Ao salvar, o estoque é baixado e uma despesa é lançada no financeiro.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPartDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={addRepairPart}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}