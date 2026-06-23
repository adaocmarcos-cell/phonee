import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignaturePad } from "@/components/SignaturePad";
import { PatternLock } from "@/components/PatternLock";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import {
  Save, X, FileDown, MessageCircle, Mail, Camera, Trash2, Printer, ArrowLeft,
  ChevronLeft, ChevronRight, FileEdit, User, Smartphone as SmartphoneIcon,
  AlertCircle, ClipboardCheck, Image as ImageIcon, Calculator, Wrench as WrenchIcon,
  PackageCheck, PenSquare, Check,
} from "lucide-react";

const CATEGORIES = ["iPhone","Xiaomi","Samsung","Motorola","Apple Watch","Smartwatch","Tablet","Notebook","Outro"];
const REASONS = ["Tela quebrada","Troca de bateria","Não liga","Não carrega","Face ID","Touch ID","Câmera","Microfone","Alto-falante","Conector de carga","Atualização","Software","Recuperação","Oxidação","Diagnóstico técnico","Outro"];
const RECEIVE_ITEMS = ["Tela intacta","Tela quebrada","Traseira intacta","Traseira quebrada","Lateral com marcas","Lateral sem marcas","Câmeras intactas","Câmeras danificadas","Face ID funcionando","Touch ID funcionando","Botões funcionando","Alto-falante funcionando","Microfone funcionando","Vibração funcionando","Wi-Fi funcionando","Bluetooth funcionando","Rede móvel funcionando"];
const ACCESSORIES = ["Sem acessórios","Caixa","Carregador","Cabo","Fonte","Capa","Película","Chip","Smartwatch","Outro"];
const WORK_ITEMS = ["Peça recebida","Serviço iniciado","Testes realizados","Serviço concluído","Controle de qualidade aprovado"];
const DELIVERY_ITEMS = ["Equipamento testado","Equipamento limpo","Cliente conferiu funcionamento","Cliente recebeu acessórios"];
const STATUS_OPTS = [
  ["recebido","Recebido"],["em_analise","Em análise"],["aguardando_orcamento","Aguardando orçamento"],
  ["aguardando_aprovacao","Aguardando aprovação"],["aguardando_peca","Aguardando peça"],
  ["em_reparo","Em reparo"],["em_testes","Em testes"],
  ["pronto_retirada","Pronto para retirada"],["entregue","Entregue"],["cancelado","Cancelado"],
] as const;

const TERMS = "Será realizado análise técnica e orçamento com base nas informações apresentadas e nas condições verificadas no equipamento. O prazo poderá sofrer alterações em razão da disponibilidade de peças ou complexidade do reparo. Equipamentos não retirados após comunicação de conclusão poderão estar sujeitos às políticas internas da empresa.";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono">{label}</Label>
      {children}
    </div>
  );
}

function DevicePasswordPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPattern = (value || "").startsWith("pattern:");
  const patternValue = isPattern ? value.slice("pattern:".length) : "";
  const textValue = isPattern ? "" : value;
  return (
    <Tabs defaultValue={isPattern ? "padrao" : "texto"} className="w-full">
      <TabsList className="h-8">
        <TabsTrigger value="texto" className="text-xs">Numérica / texto</TabsTrigger>
        <TabsTrigger value="padrao" className="text-xs">Padrão (desenho)</TabsTrigger>
      </TabsList>
      <TabsContent value="texto" className="mt-2">
        <Input
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex.: 1234"
        />
      </TabsContent>
      <TabsContent value="padrao" className="mt-2">
        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <PatternLock
            value={patternValue}
            onChange={(v) => onChange(v ? `pattern:${v}` : "")}
          />
          <p className="text-[11px] text-muted-foreground max-w-[200px] leading-snug">
            Toque nos pontos na ordem em que o cliente desenha. Verde indica o
            <strong className="text-foreground"> início</strong>, vermelho o
            <strong className="text-foreground"> fim</strong> e as setas mostram a
            direção do traçado.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function CheckGrid({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card hover:border-primary/40 cursor-pointer text-sm">
          <Checkbox checked={value.includes(o)} onCheckedChange={() => toggle(o)} />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}

export default function OrdemServicoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { store, user } = useAuth();
  const editing = !!id;
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editing);
  const [step, setStep] = useState(0);
  const [os, setOs] = useState<any>({
    status: "recebido", reasons: [], accessories: [], photos: [],
    receive_checklist: {}, work_checklist: {}, delivery_checklist: {},
    parts_value: 0, labor_value: 0, total_value: 0,
    budget_status: "pendente",
  });

  const set = (k: string, v: any) => setOs((p: any) => ({ ...p, [k]: v }));
  const setChk = (group: string, k: string, v: boolean) =>
    setOs((p: any) => ({ ...p, [group]: { ...(p[group] || {}), [k]: v } }));

  useEffect(() => {
    if (!editing || !store) return;
    (async () => {
      const { data } = await (supabase as any).from("service_orders").select("*").eq("id", id).maybeSingle();
      if (data) setOs(data);
      setLoaded(true);
    })();
  }, [editing, id, store]);

  // Total auto
  useEffect(() => {
    const t = Number(os.parts_value || 0) + Number(os.labor_value || 0);
    if (t !== Number(os.total_value || 0)) setOs((p: any) => ({ ...p, total_value: t }));
  }, [os.parts_value, os.labor_value]); // eslint-disable-line

  const onPhoto = async (files: FileList | null) => {
    if (!files || !store) return;
    setBusy(true);
    const urls: string[] = [...(os.photos || [])];
    for (const f of Array.from(files)) {
      const path = `${store.id}/${id ?? "draft"}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("service-order-photos").upload(path, f);
      if (!error) {
        const { data } = await supabase.storage.from("service-order-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
    }
    set("photos", urls);
    setBusy(false);
  };

  const persist = async (asDraft = false) => {
    if (!store) return;
    if (!asDraft && !os.customer_name) return toast.error("Informe o nome do cliente");
    setBusy(true);
    const payload: any = {
      ...os,
      store_id: store.id,
      created_by: user?.id,
      customer_name: os.customer_name || (asDraft ? "Rascunho" : ""),
    };
    delete payload.id; delete payload.os_number; delete payload.created_at; delete payload.updated_at;
    if (os.customer_signature || os.tech_signature) payload.signed_at = new Date().toISOString();

    if (editing) {
      const { error } = await (supabase as any).from("service_orders").update(payload).eq("id", id);
      if (error) { setBusy(false); return toast.error(error.message); }
      toast.success(asDraft ? "Rascunho salvo" : "OS atualizada");
    } else {
      const { data, error } = await (supabase as any).from("service_orders").insert(payload).select("id").single();
      if (error) { setBusy(false); return toast.error(error.message); }
      toast.success(asDraft ? "Rascunho criado" : "OS criada");
      navigate(`/painel/ordens/${data.id}`); setBusy(false); return;
    }
    setBusy(false);
  };
  const submit = () => persist(false);
  const saveDraft = () => persist(true);

  const summary = useMemo(() => {
    const storeName = (store as any)?.trade_name || store?.name || "Phonee";
    return `*${storeName} — Ordem de Serviço #${String(os.os_number ?? "—").padStart(4, "0")}*

Cliente: ${os.customer_name || "—"}
Aparelho: ${[os.device_brand, os.device_model].filter(Boolean).join(" ")}
IMEI: ${os.device_imei1 || "—"}
Defeito: ${(os.reasons || []).join(", ") || "—"}

Orçamento:
• Peças: ${brl(Number(os.parts_value || 0))}
• Mão de obra: ${brl(Number(os.labor_value || 0))}
• Total: *${brl(Number(os.total_value || 0))}*
• Prazo: ${os.estimated_days ? `${os.estimated_days} dia(s)` : "a definir"}

Status: ${os.status}`;
  }, [os]);

  const sendWhats = (text: string) => {
    const phone = String(os.customer_whatsapp || "").replace(/\D/g, "");
    if (!phone) return toast.error("Informe o WhatsApp do cliente");
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, "_blank");
  };
  const sendMail = () => {
    if (!os.customer_email) return toast.error("Informe o e-mail do cliente");
    const storeName = (store as any)?.trade_name || store?.name || "Phonee";
    const subject = encodeURIComponent(`Ordem de Serviço #${String(os.os_number ?? "").padStart(4, "0")} — ${storeName}`);
    window.open(`mailto:${os.customer_email}?subject=${subject}&body=${encodeURIComponent(summary)}`);
  };

  if (!loaded) return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="pb-28 md:pb-6">
      <PageHeader
        title={editing ? `OS #${String(os.os_number ?? "").padStart(4, "0")}` : "Nova Ordem de Serviço"}
        description="Preencha por etapas — você pode salvar como rascunho a qualquer momento."
        actions={
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/painel/ordens")}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
            {editing && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />PDF</Button>}
            {editing && <Button variant="outline" onClick={() => sendWhats(summary)}><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</Button>}
            {editing && <Button variant="outline" onClick={sendMail}><Mail className="h-4 w-4 mr-1" />E-mail</Button>}
            <Button variant="outline" onClick={saveDraft} disabled={busy}>
              <FileEdit className="h-4 w-4 mr-1" />Salvar rascunho
            </Button>
            <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground shadow-glow">
              <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar OS"}
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
      {(() => {
        const steps = [
          { key: "cliente", label: "Cliente", icon: User },
          { key: "aparelho", label: "Aparelho", icon: SmartphoneIcon },
          { key: "motivo", label: "Motivo", icon: AlertCircle },
          { key: "checklist", label: "Checklist", icon: ClipboardCheck },
          { key: "fotos", label: "Fotos", icon: ImageIcon },
          { key: "orcamento", label: "Orçamento", icon: Calculator },
          { key: "execucao", label: "Execução", icon: WrenchIcon },
          { key: "entrega", label: "Entrega", icon: PackageCheck },
          { key: "assinaturas", label: "Assinaturas", icon: PenSquare },
        ] as const;
        const current = steps[step];
        const progress = Math.round(((step + 1) / steps.length) * 100);
        return (
          <div className="space-y-4">
            {/* Stepper header */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <span>Etapa {step + 1} de {steps.length}</span>
                <span className="text-primary font-semibold">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                {steps.map((s, idx) => {
                  const Icon = s.icon;
                  const done = idx < step;
                  const active = idx === step;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStep(idx)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : done
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "bg-card text-muted-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                      <span className="hidden sm:inline">{idx + 1}. {s.label}</span>
                      <span className="sm:hidden">{idx + 1}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="flex items-center gap-2 text-sm font-semibold">
              <current.icon className="h-4 w-4 text-primary" />
              {current.label}
            </div>

            <div data-step={current.key}>
      <Tabs value={current.key} className="space-y-4">

        <TabsContent value="cliente">
          <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Nome completo *"><Input value={os.customer_name || ""} onChange={(e) => set("customer_name", e.target.value)} /></Field>
            <Field label="CPF"><Input value={os.customer_cpf || ""} onChange={(e) => set("customer_cpf", e.target.value)} /></Field>
            <Field label="WhatsApp"><Input value={os.customer_whatsapp || ""} onChange={(e) => set("customer_whatsapp", e.target.value)} placeholder="(11) 90000-0000" /></Field>
            <Field label="E-mail"><Input type="email" value={os.customer_email || ""} onChange={(e) => set("customer_email", e.target.value)} /></Field>
            <Field label="Cidade"><Input value={os.customer_city || ""} onChange={(e) => set("customer_city", e.target.value)} /></Field>
            <Field label="Endereço"><Input value={os.customer_address || ""} onChange={(e) => set("customer_address", e.target.value)} /></Field>
          </Card>
        </TabsContent>

        <TabsContent value="aparelho">
          <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Categoria">
              <Select value={os.device_category || ""} onValueChange={(v) => set("device_category", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Marca"><Input value={os.device_brand || ""} onChange={(e) => set("device_brand", e.target.value)} /></Field>
            <Field label="Modelo"><Input value={os.device_model || ""} onChange={(e) => set("device_model", e.target.value)} /></Field>
            <Field label="Cor"><Input value={os.device_color || ""} onChange={(e) => set("device_color", e.target.value)} /></Field>
            <Field label="Armazenamento"><Input value={os.device_storage || ""} onChange={(e) => set("device_storage", e.target.value)} /></Field>
            <Field label="Versão do sistema"><Input value={os.device_system || ""} onChange={(e) => set("device_system", e.target.value)} /></Field>
            <Field label="IMEI 1"><Input value={os.device_imei1 || ""} onChange={(e) => set("device_imei1", e.target.value)} /></Field>
            <Field label="IMEI 2"><Input value={os.device_imei2 || ""} onChange={(e) => set("device_imei2", e.target.value)} /></Field>
            <Field label="Número de série"><Input value={os.device_serial || ""} onChange={(e) => set("device_serial", e.target.value)} /></Field>
            <Field label="Senha informada pelo cliente">
              <DevicePasswordPicker value={os.device_password || ""} onChange={(v) => set("device_password", v)} />
            </Field>
          </Card>
        </TabsContent>

        <TabsContent value="motivo">
          <Card className="p-5 space-y-4">
            <CheckGrid options={REASONS} value={os.reasons || []} onChange={(v) => set("reasons", v)} />
            <Field label="Descrição detalhada do problema">
              <Textarea rows={4} value={os.issue_description || ""} onChange={(e) => set("issue_description", e.target.value)} />
            </Field>
          </Card>
        </TabsContent>

        <TabsContent value="checklist">
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm mb-3">Estado físico do aparelho</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {RECEIVE_ITEMS.map((it) => (
                  <label key={it} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card text-sm cursor-pointer hover:border-primary/40">
                    <Checkbox checked={!!os.receive_checklist?.[it]} onCheckedChange={(v) => setChk("receive_checklist", it, !!v)} />
                    <span>{it}</span>
                  </label>
                ))}
              </div>
            </div>
            <Field label="Saúde da bateria (%)">
              <Input type="number" min={0} max={100} value={os.battery_health ?? ""} onChange={(e) => set("battery_health", e.target.value ? Number(e.target.value) : null)} className="max-w-[160px]" />
            </Field>
            <div>
              <h3 className="font-semibold text-sm mb-3">Acessórios recebidos</h3>
              <CheckGrid options={ACCESSORIES} value={os.accessories || []} onChange={(v) => set("accessories", v)} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="fotos">
          <Card className="p-5">
            <label className="flex items-center gap-2 p-4 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/40 text-sm text-muted-foreground">
              <Camera className="h-4 w-4" />
              Anexar fotos (frente, traseira, laterais, danos)
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPhoto(e.target.files)} />
            </label>
            {(os.photos || []).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                {(os.photos || []).map((u: string, i: number) => (
                  <div key={i} className="relative group">
                    <img src={u} alt={`Foto ${i + 1}`} className="w-full h-32 object-cover rounded-md border border-border" />
                    <Button type="button" size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => set("photos", os.photos.filter((_: any, idx: number) => idx !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="orcamento">
          <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Peças (R$)"><Input type="number" step="0.01" value={os.parts_value ?? 0} onChange={(e) => set("parts_value", Number(e.target.value))} /></Field>
            <Field label="Mão de obra (R$)"><Input type="number" step="0.01" value={os.labor_value ?? 0} onChange={(e) => set("labor_value", Number(e.target.value))} /></Field>
            <Field label="Total (R$)"><Input readOnly value={(Number(os.parts_value || 0) + Number(os.labor_value || 0)).toFixed(2)} className="bg-primary/10 text-primary font-bold" /></Field>
            <Field label="Prazo estimado (dias)"><Input type="number" min={0} value={os.estimated_days ?? ""} onChange={(e) => set("estimated_days", e.target.value ? Number(e.target.value) : null)} /></Field>
            <Field label="Status do orçamento">
              <Select value={os.budget_status} onValueChange={(v) => set("budget_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Aguardando aprovação</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="reprovado">Reprovado</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="button" variant="outline" onClick={() => sendWhats(summary)}>
                <MessageCircle className="h-4 w-4 mr-1" />Enviar orçamento por WhatsApp
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="execucao">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Técnico responsável"><Input value={os.technician || ""} onChange={(e) => set("technician", e.target.value)} /></Field>
              <Field label="Data de início"><Input type="date" value={os.start_date || ""} onChange={(e) => set("start_date", e.target.value)} /></Field>
              <Field label="Data de conclusão"><Input type="date" value={os.end_date || ""} onChange={(e) => set("end_date", e.target.value)} /></Field>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">Checklist interno</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {WORK_ITEMS.map((it) => (
                  <label key={it} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card text-sm cursor-pointer hover:border-primary/40">
                    <Checkbox checked={!!os.work_checklist?.[it]} onCheckedChange={(v) => setChk("work_checklist", it, !!v)} />
                    <span>{it}</span>
                  </label>
                ))}
              </div>
            </div>
            <Field label="Status da OS">
              <Select value={os.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </Card>
        </TabsContent>

        <TabsContent value="entrega">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {DELIVERY_ITEMS.map((it) => (
                <label key={it} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card text-sm cursor-pointer hover:border-primary/40">
                  <Checkbox checked={!!os.delivery_checklist?.[it]} onCheckedChange={(v) => setChk("delivery_checklist", it, !!v)} />
                  <span>{it}</span>
                </label>
              ))}
            </div>
            <Field label="Observações finais">
              <Textarea rows={3} value={os.final_notes || ""} onChange={(e) => set("final_notes", e.target.value)} />
            </Field>
          </Card>
        </TabsContent>

        <TabsContent value="assinaturas">
          <Card className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <SignaturePad label="Assinatura do cliente" value={os.customer_signature} onChange={(v) => set("customer_signature", v)} />
            <SignaturePad label="Assinatura do técnico" value={os.tech_signature} onChange={(v) => set("tech_signature", v)} />
            <div className="md:col-span-2 text-xs text-muted-foreground">
              {os.signed_at && <p>Assinada em {new Date(os.signed_at).toLocaleString("pt-BR")}.</p>}
              <p className="mt-2 italic">{TERMS}</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
            </div>

            {/* Wizard footer */}
            <Card className="p-3 flex items-center justify-between gap-2 sticky bottom-20 md:bottom-4 z-30 shadow-card">
              <Button
                type="button"
                variant="outline"
                disabled={step === 0}
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />Voltar
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={saveDraft} disabled={busy}>
                  <FileEdit className="h-4 w-4 mr-1" />Salvar rascunho
                </Button>
                {step < steps.length - 1 ? (
                  <Button
                    type="button"
                    onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                    className="bg-primary text-primary-foreground"
                  >
                    Próximo<ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button type="button" onClick={submit} disabled={busy} className="bg-primary text-primary-foreground shadow-glow">
                    <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Finalizar OS"}
                  </Button>
                )}
              </div>
            </Card>
          </div>
        );
      })()}
      </div>

      {/* Mobile actions */}
      <div className="fixed md:hidden bottom-0 left-0 right-0 p-3 bg-card border-t border-border flex gap-2 z-50">
        <Button variant="ghost" size="sm" onClick={() => navigate("/painel/ordens")}><X className="h-4 w-4" /></Button>
        {editing && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>}
        <Button variant="outline" size="sm" onClick={saveDraft} disabled={busy}><FileEdit className="h-4 w-4" /></Button>
        <Button onClick={submit} disabled={busy} className="flex-1 bg-primary text-primary-foreground">
          <Save className="h-4 w-4 mr-1" />{busy ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      {/* Print-friendly PDF view */}
      {editing && (
        <div className="hidden print:block text-black text-sm">
          <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight uppercase">{(store as any)?.trade_name || store?.name || "MOBILE+"}</h1>
              <p className="text-[11px] text-gray-700">
                {(store as any)?.tax_id ? `CNPJ/CPF: ${(store as any).tax_id}` : "Assistência Técnica"}
              </p>
              {(store as any)?.address && <p className="text-[11px] text-gray-700">{(store as any).address}</p>}
              <p className="text-[11px] text-gray-700">
                {(store as any)?.phone && `Tel: ${(store as any).phone}`}
                {(store as any)?.phone && (store as any)?.email && " · "}
                {(store as any)?.email && `${(store as any).email}`}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl font-mono font-bold">OS #{String(os.os_number ?? "").padStart(4, "0")}</div>
              <div className="text-xs">{new Date(os.created_at || Date.now()).toLocaleString("pt-BR")}</div>
              <div className="text-[10px] mt-1 italic">Documento de Garantia / Ordem de Serviço</div>
            </div>
          </div>

          <Section title="Cliente">
            <Grid>
              <KV k="Nome" v={os.customer_name} />
              <KV k="CPF" v={os.customer_cpf} />
              <KV k="WhatsApp" v={os.customer_whatsapp} />
              <KV k="E-mail" v={os.customer_email} />
              <KV k="Cidade" v={os.customer_city} />
              <KV k="Endereço" v={os.customer_address} />
            </Grid>
          </Section>

          <Section title="Equipamento">
            <Grid>
              <KV k="Categoria" v={os.device_category} />
              <KV k="Marca / Modelo" v={[os.device_brand, os.device_model].filter(Boolean).join(" ")} />
              <KV k="Cor" v={os.device_color} />
              <KV k="Armazenamento" v={os.device_storage} />
              <KV k="IMEI 1" v={os.device_imei1} />
              <KV k="IMEI 2" v={os.device_imei2} />
              <KV k="Nº de série" v={os.device_serial} />
              <KV k="Sistema" v={os.device_system} />
            </Grid>
          </Section>

          <Section title="Defeito informado">
            <p className="mb-1"><strong>Motivos:</strong> {(os.reasons || []).join(", ") || "—"}</p>
            <p>{os.issue_description || "—"}</p>
          </Section>

          <Section title="Checklist de recebimento">
            <div className="grid grid-cols-3 gap-1 text-xs">
              {RECEIVE_ITEMS.map((it) => (
                <div key={it}>{os.receive_checklist?.[it] ? "☑" : "☐"} {it}</div>
              ))}
            </div>
            <p className="mt-2 text-xs">Bateria: <strong>{os.battery_health ?? "—"}%</strong></p>
            <p className="text-xs">Acessórios: {(os.accessories || []).join(", ") || "Sem acessórios"}</p>
          </Section>

          {(os.photos || []).length > 0 && (
            <Section title="Fotos">
              <div className="grid grid-cols-3 gap-2">
                {os.photos.map((u: string, i: number) => (
                  <img key={i} src={u} alt="" className="w-full h-24 object-cover border border-black" />
                ))}
              </div>
            </Section>
          )}

          <Section title="Orçamento">
            <Grid>
              <KV k="Peças" v={brl(Number(os.parts_value || 0))} />
              <KV k="Mão de obra" v={brl(Number(os.labor_value || 0))} />
              <KV k="Total" v={brl(Number(os.total_value || 0))} />
              <KV k="Prazo" v={os.estimated_days ? `${os.estimated_days} dia(s)` : "—"} />
              <KV k="Status" v={os.budget_status} />
            </Grid>
          </Section>

          <Section title="Termos">
            <p className="text-[10px] leading-snug">{TERMS}</p>
          </Section>

          <div className="grid grid-cols-2 gap-6 mt-6">
            <div className="border-t border-black pt-2 text-center text-xs">
              {os.customer_signature && <img src={os.customer_signature} alt="" className="mx-auto h-16" />}
              Assinatura do cliente
            </div>
            <div className="border-t border-black pt-2 text-center text-xs">
              {os.tech_signature && <img src={os.tech_signature} alt="" className="mx-auto h-16" />}
              Assinatura do técnico
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="text-xs font-bold uppercase tracking-widest bg-black text-white px-2 py-1 mb-2">{title}</h2>
      <div className="px-1">{children}</div>
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{children}</div>;
}
function KV({ k, v }: { k: string; v?: any }) {
  return <div><span className="text-gray-600">{k}:</span> <strong>{v || "—"}</strong></div>;
}