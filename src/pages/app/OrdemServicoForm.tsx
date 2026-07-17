import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignaturePad } from "@/components/SignaturePad";
import { PatternLock } from "@/components/PatternLock";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { WhatsappSendButton } from "@/components/WhatsappSendButton";
import { OsWhatsappHistory } from "@/components/OsWhatsappHistory";
import {
  Save, X, FileDown, MessageCircle, Mail, Camera, Trash2, Printer, ArrowLeft,
  ChevronLeft, ChevronRight, FileEdit, User, Smartphone as SmartphoneIcon,
  AlertCircle, ClipboardCheck, Image as ImageIcon, Calculator, Wrench as WrenchIcon,
  PackageCheck, PenSquare, Check, FileText, Link2,
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
  const [laudoOpen, setLaudoOpen] = useState(false);
  const [laudoObs, setLaudoObs] = useState("");
  const [laudoAnalise, setLaudoAnalise] = useState("");
  const [technicians, setTechnicians] = useState<{ user_id: string; full_name: string }[]>([]);
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

  useEffect(() => {
    if (!store) return;
    (async () => {
      const { data } = await (supabase as any).rpc("get_store_technicians", { _store_id: store.id });
      setTechnicians((data as any[]) ?? []);
    })();
  }, [store?.id]);

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

  // Variáveis padrão para os templates de WhatsApp desta OS.
  const waVars = useMemo(() => {
    const storeName = (store as any)?.trade_name || store?.name || "Phonee";
    const device = [os.device_brand, os.device_model].filter(Boolean).join(" ");
    const days = Number(os.estimated_days || 0);
    const prazo = days > 0 ? `${days} dia(s) úteis` : "a definir";
    const base = os.end_date ? new Date(os.end_date) : new Date();
    const garantia = new Date(base.getTime() + 90 * 24 * 60 * 60 * 1000);
    const trackingUrl = os.public_token
      ? `${window.location.origin}/os/${os.public_token}`
      : "";
    return {
      cliente: os.customer_name || "cliente",
      loja: storeName,
      os_numero: String(os.os_number ?? "").padStart(4, "0"),
      aparelho: device,
      valor: brl(Number(os.total_value || 0)),
      prazo,
      garantia_ate: garantia.toLocaleDateString("pt-BR"),
      link_acompanhamento: trackingUrl,
    };
  }, [os, store]);

  const copyTrackingLink = async () => {
    if (!os.public_token) return toast.error("Salve a OS para gerar o link público.");
    const url = `${window.location.origin}/os/${os.public_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de acompanhamento copiado!");
    } catch {
      window.prompt("Copie o link de acompanhamento:", url);
    }
  };

  const sendMail = () => {
    if (!os.customer_email) return toast.error("Informe o e-mail do cliente");
    const storeName = (store as any)?.trade_name || store?.name || "Phonee";
    const subject = encodeURIComponent(`Ordem de Serviço #${String(os.os_number ?? "").padStart(4, "0")} — ${storeName}`);
    window.open(`mailto:${os.customer_email}?subject=${subject}&body=${encodeURIComponent(summary)}`);
  };

  const openLaudo = () => {
    const defaultAnalise = [
      os.reasons?.length ? `Defeitos relatados pelo cliente: ${os.reasons.join(", ")}.` : "",
      os.issue_description ? `Descrição do cliente: ${os.issue_description}` : "",
      os.battery_health != null ? `Saúde da bateria medida: ${os.battery_health}%.` : "",
      "Após inspeção visual e testes funcionais, foi identificada a necessidade de intervenção técnica conforme orçamento apresentado.",
    ].filter(Boolean).join("\n\n");
    const defaultObs = [
      os.accessories?.length ? `Acessórios recebidos: ${os.accessories.join(", ")}.` : "",
      os.final_notes || "",
      "Equipamento entregue ao cliente em condições funcionais conforme escopo do serviço realizado.",
    ].filter(Boolean).join("\n\n");
    setLaudoAnalise(laudoAnalise || defaultAnalise);
    setLaudoObs(laudoObs || defaultObs);
    setLaudoOpen(true);
  };

  const gerarLaudoHTML = () => {
    const s: any = store || {};
    const logo = s.pdf_logo_url || s.logo_url || "";
    const primary = s.pdf_primary_color || "#0F4C81";
    const accent = s.pdf_accent_color || "#0E7CFF";
    const storeName = s.trade_name || s.name || "Assistência Técnica";
    const addr = [s.address_street, s.address_number, s.address_neighborhood, s.address_city, s.address_uf]
      .filter(Boolean).join(", ") || s.address || "";
    const today = new Date().toLocaleDateString("pt-BR");
    const osNum = String(os.os_number ?? "").padStart(4, "0");
    const esc = (v: any) => String(v ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const nl2br = (v: string) => esc(v).replace(/\n/g, "<br/>");
    const reasons = (os.reasons || []).join(", ") || "—";
    const device = [os.device_brand, os.device_model].filter(Boolean).join(" ") || "—";

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>Laudo Técnico OS #${osNum}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0;font-size:12px;line-height:1.45}
  .wrap{max-width:760px;margin:0 auto;padding:24px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${primary};padding-bottom:14px;margin-bottom:18px;gap:16px}
  .brand{display:flex;gap:14px;align-items:center}
  .brand img{height:64px;width:auto;object-fit:contain}
  .brand h1{margin:0;font-size:20px;color:${primary};letter-spacing:.3px}
  .brand .meta{font-size:11px;color:#444;margin-top:4px}
  .doc-title{text-align:right}
  .doc-title .tag{display:inline-block;background:${primary};color:#fff;padding:4px 10px;border-radius:4px;font-size:11px;letter-spacing:2px;text-transform:uppercase}
  .doc-title h2{margin:8px 0 2px;font-size:18px;font-family:ui-monospace,Menlo,monospace}
  .doc-title .date{font-size:11px;color:#555}
  h3.section{font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#fff;background:${primary};padding:6px 10px;margin:18px 0 8px;border-radius:3px}
  table.kv{width:100%;border-collapse:collapse;margin-bottom:4px}
  table.kv td{padding:5px 8px;border:1px solid #e3e6ea;vertical-align:top;font-size:12px}
  table.kv td.k{background:#f6f8fb;color:#555;width:28%;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:1px}
  .box{border:1px solid #e3e6ea;border-left:4px solid ${accent};padding:10px 14px;border-radius:3px;background:#fbfcfe;white-space:pre-wrap}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .sign{margin-top:42px;display:grid;grid-template-columns:1fr 1fr;gap:32px}
  .sign .line{border-top:1px solid #111;padding-top:6px;text-align:center;font-size:11px;color:#333}
  .sign img{display:block;margin:0 auto -4px;max-height:54px}
  .footer{margin-top:28px;border-top:1px solid #ddd;padding-top:10px;font-size:10px;color:#666;text-align:center}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;background:${accent}1a;color:${accent};font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:1px}
  @media print{ .noprint{display:none} body{font-size:11px} }
  .actions{position:fixed;top:12px;right:12px;display:flex;gap:8px}
  .actions button{background:${primary};color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600}
  .actions button.alt{background:#fff;color:${primary};border:1px solid ${primary}}
</style></head><body>
<div class="actions noprint">
  <button onclick="window.print()">Imprimir / Salvar PDF</button>
  <button class="alt" onclick="window.close()">Fechar</button>
</div>
<div class="wrap">
  <div class="head">
    <div class="brand">
      ${logo ? `<img src="${esc(logo)}" alt="logo" />` : ""}
      <div>
        <h1>${esc(storeName)}</h1>
        <div class="meta">
          ${s.tax_id ? `CNPJ/CPF: ${esc(s.tax_id)}<br/>` : ""}
          ${addr ? `${esc(addr)}<br/>` : ""}
          ${s.phone ? `Tel: ${esc(s.phone)}` : ""}${s.phone && s.email ? " · " : ""}${s.email ? esc(s.email) : ""}
        </div>
      </div>
    </div>
    <div class="doc-title">
      <span class="tag">Laudo Técnico</span>
      <h2>OS #${osNum}</h2>
      <div class="date">Emitido em ${today}</div>
    </div>
  </div>

  <h3 class="section">Dados do cliente</h3>
  <table class="kv">
    <tr><td class="k">Nome</td><td>${esc(os.customer_name)}</td><td class="k">CPF</td><td>${esc(os.customer_cpf)}</td></tr>
    <tr><td class="k">Telefone</td><td>${esc(os.customer_whatsapp)}</td><td class="k">E-mail</td><td>${esc(os.customer_email)}</td></tr>
    <tr><td class="k">Cidade</td><td>${esc(os.customer_city)}</td><td class="k">Endereço</td><td>${esc(os.customer_address)}</td></tr>
  </table>

  <h3 class="section">Identificação do equipamento</h3>
  <table class="kv">
    <tr><td class="k">Categoria</td><td>${esc(os.device_category)}</td><td class="k">Marca / Modelo</td><td>${esc(device)}</td></tr>
    <tr><td class="k">Cor</td><td>${esc(os.device_color)}</td><td class="k">Armazenamento</td><td>${esc(os.device_storage)}</td></tr>
    <tr><td class="k">IMEI 1</td><td>${esc(os.device_imei1)}</td><td class="k">IMEI 2</td><td>${esc(os.device_imei2)}</td></tr>
    <tr><td class="k">Nº de série</td><td>${esc(os.device_serial)}</td><td class="k">Sistema</td><td>${esc(os.device_system)}</td></tr>
    <tr><td class="k">Saúde da bateria</td><td>${os.battery_health != null ? esc(os.battery_health) + "%" : "—"}</td><td class="k">Acessórios</td><td>${esc((os.accessories || []).join(", ") || "—")}</td></tr>
  </table>

  <h3 class="section">Defeito reclamado</h3>
  <div class="box"><strong>Motivos:</strong> ${esc(reasons)}${os.issue_description ? `<br/><br/>${nl2br(os.issue_description)}` : ""}</div>

  <h3 class="section">Análise técnica</h3>
  <div class="box">${nl2br(laudoAnalise) || "—"}</div>

  <h3 class="section">Observações</h3>
  <div class="box">${nl2br(laudoObs) || "—"}</div>

  <h3 class="section">Conclusão / Orçamento</h3>
  <table class="kv">
    <tr><td class="k">Peças</td><td>${esc(brl(Number(os.parts_value || 0)))}</td><td class="k">Mão de obra</td><td>${esc(brl(Number(os.labor_value || 0)))}</td></tr>
    <tr><td class="k">Total</td><td><strong>${esc(brl(Number(os.total_value || 0)))}</strong></td><td class="k">Prazo</td><td>${os.estimated_days ? `${esc(os.estimated_days)} dia(s)` : "—"}</td></tr>
    <tr><td class="k">Técnico responsável</td><td>${esc(os.technician)}</td><td class="k">Status</td><td><span class="badge">${esc(os.status)}</span></td></tr>
  </table>

  <div class="sign">
    <div>
      ${os.customer_signature ? `<img src="${esc(os.customer_signature)}" alt="assinatura cliente" />` : ""}
      <div class="line">Assinatura do cliente</div>
    </div>
    <div>
      ${os.tech_signature ? `<img src="${esc(os.tech_signature)}" alt="assinatura técnico" />` : ""}
      <div class="line">${esc(os.technician) !== "—" ? esc(os.technician) + " — " : ""}Responsável técnico</div>
    </div>
  </div>

  <div class="footer">
    ${esc(s.pdf_footer_text || `Este laudo técnico foi emitido por ${storeName} e tem validade exclusivamente para a OS #${osNum}.`)}
  </div>
</div>
<script>setTimeout(()=>{try{window.focus()}catch(e){}},150)</script>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) { toast.error("Permita pop-ups para gerar o laudo"); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setLaudoOpen(false);
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
            {editing && <Button variant="outline" onClick={openLaudo}><FileText className="h-4 w-4 mr-1" />Laudo Técnico</Button>}
            {editing && os.public_token && (
              <Button variant="outline" onClick={copyTrackingLink} title="Copiar link público de acompanhamento">
                <Link2 className="h-4 w-4 mr-1" />Link do cliente
              </Button>
            )}
            {editing && store && (
              <WhatsappSendButton
                storeId={store.id}
                phone={os.customer_whatsapp}
                osId={os.id}
                osStatus={os.status}
                budgetStatus={os.budget_status}
                vars={waVars}
              />
            )}
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
              <NumberInput allowDecimal={false} min={0} value={os.battery_health ?? 0} onValueChange={(n) => set("battery_health", n === 0 ? null : Math.min(100, n))} className="max-w-[160px]" />
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
            <Field label="Peças (R$)"><NumberInput value={os.parts_value ?? 0} onValueChange={(n) => set("parts_value", n)} /></Field>
            <Field label="Mão de obra (R$)"><NumberInput value={os.labor_value ?? 0} onValueChange={(n) => set("labor_value", n)} /></Field>
            <Field label="Total (R$)"><Input readOnly value={(Number(os.parts_value || 0) + Number(os.labor_value || 0)).toFixed(2)} className="bg-primary/10 text-primary font-bold" /></Field>
            <Field label="Prazo estimado (dias)"><NumberInput allowDecimal={false} min={0} value={os.estimated_days ?? 0} onValueChange={(n) => set("estimated_days", n === 0 ? null : n)} /></Field>
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
              {editing && store && (
                <WhatsappSendButton
                  storeId={store.id}
                  phone={os.customer_whatsapp}
                  osId={os.id}
                  osStatus={os.status}
                  budgetStatus={os.budget_status}
                  vars={waVars}
                  allowedEvents={["orcamento_pronto", "orcamento_aprovado"]}
                />
              )}
              {editing && os.public_token && (
                <Button variant="outline" onClick={copyTrackingLink} className="ml-2">
                  <Link2 className="h-4 w-4 mr-1" />Copiar link de acompanhamento
                </Button>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="execucao">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Técnico responsável">
                <Select
                  value={os.technician_id || "__none"}
                  onValueChange={(v) => {
                    if (v === "__none") { set("technician_id", null); return; }
                    const t = technicians.find((x) => x.user_id === v);
                    setOs((p: any) => ({ ...p, technician_id: v, technician: t?.full_name || p.technician }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione um técnico…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Sem técnico vinculado —</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nome (impressão)"><Input value={os.technician || ""} onChange={(e) => set("technician", e.target.value)} placeholder="Auto-preenchido pelo técnico selecionado" /></Field>
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
          {editing && os.id && (
            <div className="mt-4">
              <OsWhatsappHistory osId={os.id} />
            </div>
          )}
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
        {editing && <Button variant="outline" size="sm" onClick={openLaudo}><FileText className="h-4 w-4" /></Button>}
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

      <Dialog open={laudoOpen} onOpenChange={setLaudoOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Laudo Técnico — OS #{String(os.os_number ?? "").padStart(4, "0")}</DialogTitle>
            <DialogDescription>
              Os dados do aparelho, cliente e orçamento serão preenchidos automaticamente. Edite a análise e as observações abaixo antes de gerar o laudo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs grid grid-cols-2 gap-x-4 gap-y-1">
              <div><span className="text-muted-foreground">Cliente:</span> <strong>{os.customer_name || "—"}</strong></div>
              <div><span className="text-muted-foreground">Aparelho:</span> <strong>{[os.device_brand, os.device_model].filter(Boolean).join(" ") || "—"}</strong></div>
              <div><span className="text-muted-foreground">IMEI:</span> <strong>{os.device_imei1 || "—"}</strong></div>
              <div><span className="text-muted-foreground">Total:</span> <strong>{brl(Number(os.total_value || 0))}</strong></div>
            </div>
            <Field label="Análise técnica (editável)">
              <Textarea rows={6} value={laudoAnalise} onChange={(e) => setLaudoAnalise(e.target.value)} placeholder="Descreva os testes realizados, componentes inspecionados e diagnóstico." />
            </Field>
            <Field label="Observações (editável)">
              <Textarea rows={4} value={laudoObs} onChange={(e) => setLaudoObs(e.target.value)} placeholder="Recomendações ao cliente, garantia, ressalvas, etc." />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaudoOpen(false)}>Cancelar</Button>
            <Button onClick={gerarLaudoHTML} className="bg-primary text-primary-foreground shadow-glow">
              <FileText className="h-4 w-4 mr-1" />Gerar Laudo Técnico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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