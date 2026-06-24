import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink, FileText, Instagram, MessageCircle, Search, Trash2, Users, Gift, Play } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Lead {
  id: string;
  name: string;
  instagram: string;
  whatsapp: string;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
  kind?: "demo" | "indicacao" | null;
  referral_code?: string | null;
}

function digitsOnly(v: string) { return (v || "").replace(/\D/g, ""); }

function formatWhats(v: string) {
  const d = digitsOnly(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v;
}

function whatsappLink(v: string) {
  const d = digitsOnly(v);
  const intl = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${intl}`;
}

const DEMO_URL = "https://phonee.com.br";
const PITCH_MESSAGE = `Olá, tudo bem?

Vi que você conheceu a Phonee. Ela foi criada especialmente para lojas de smartphones e assistências técnicas que precisam de mais controle e menos retrabalho.

Com a Phonee você acompanha estoque, vendas, financeiro e indicadores em tempo real, evita falta de produtos, faz compras mais assertivas e reduz perdas por falta de controle.

Tudo em um único sistema, pensado para ajudar sua loja a vender mais e operar com mais eficiência.

Posso te mostrar rapidamente como funciona?`;

function whatsappPitchLink(v: string) {
  return `${whatsappLink(v)}?text=${encodeURIComponent(PITCH_MESSAGE)}`;
}

function instagramLink(handle: string) {
  return `https://instagram.com/${handle.replace(/^@+/, "")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function PhoneeLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "demo" | "indicacao">("all");

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("demo_leads") as any)
      .select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = leads;
    if (kindFilter !== "all") base = base.filter((l) => (l.kind ?? "demo") === kindFilter);
    if (!q) return base;
    return base.filter((l) =>
      l.name.toLowerCase().includes(q) ||
      l.instagram.toLowerCase().includes(q) ||
      digitsOnly(l.whatsapp).includes(digitsOnly(q)),
    );
  }, [leads, query, kindFilter]);

  const counts = useMemo(() => {
    const demo = leads.filter((l) => (l.kind ?? "demo") === "demo").length;
    const indic = leads.filter((l) => l.kind === "indicacao").length;
    return { demo, indic, all: leads.length };
  }, [leads]);

  const exportCsv = () => {
    if (filtered.length === 0) { toast.error("Sem leads para exportar"); return; }
    const rows = [
      ["Data", "Nome", "Instagram", "WhatsApp", "Link Instagram", "Link WhatsApp"],
      ...filtered.map((l) => [
        formatDate(l.created_at),
        l.name,
        `@${l.instagram.replace(/^@+/, "")}`,
        formatWhats(l.whatsapp),
        instagramLink(l.instagram),
        whatsappLink(l.whatsapp),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phonee-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} lead(s) exportados`);
  };

  const exportPdf = () => {
    if (filtered.length === 0) { toast.error("Sem leads para exportar"); return; }
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text("Leads Phonee", 40, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${filtered.length} lead(s) · gerado em ${new Date().toLocaleString("pt-BR")}`,
      40, 68,
    );

    autoTable(doc, {
      startY: 88,
      head: [["Data", "Nome", "Instagram", "WhatsApp"]],
      body: filtered.map((l) => [
        formatDate(l.created_at),
        l.name,
        `@${l.instagram.replace(/^@+/, "")}`,
        formatWhats(l.whatsapp),
      ]),
      styles: { fontSize: 9, cellPadding: 6, textColor: [30, 41, 59] },
      headStyles: { fillColor: [0, 171, 251], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 95 },
        1: { cellWidth: 150 },
        2: { cellWidth: 130 },
        3: { cellWidth: 120 },
      },
      didDrawCell: (data) => {
        if (data.section !== "body") return;
        const lead = filtered[data.row.index];
        if (!lead) return;
        if (data.column.index === 2) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, {
            url: instagramLink(lead.instagram),
          });
        }
        if (data.column.index === 3) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, {
            url: whatsappPitchLink(lead.whatsapp),
          });
        }
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 120;
    let y = finalY + 30;
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 60;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(40, y, pageW - 40, y);
    y += 24;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("Quer apresentar a demonstração para esses leads?", 40, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(
      "Compartilhe o link abaixo do botão \"Ver demonstração\" para que possam experimentar a plataforma:",
      40, y, { maxWidth: pageW - 80 },
    );
    y += 30;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 171, 251);
    doc.textWithLink(DEMO_URL, 40, y, { url: DEMO_URL });

    doc.save(`phonee-leads-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success(`${filtered.length} lead(s) exportados em PDF`);
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este lead?")) return;
    const { error } = await supabase.from("demo_leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setLeads((ls) => ls.filter((l) => l.id !== id));
    toast.success("Lead removido");
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
            <Users className="h-3.5 w-3.5" /> Captura
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 mt-1">Leads Phonee</h1>
          <p className="text-sm text-slate-400 mt-1">
            {counts.all} total · {counts.demo} de demonstração · {counts.indic} de indicação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportPdf} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90 font-semibold">
            <FileText className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
          <Button onClick={exportCsv} variant="outline"
            className="border-slate-300 bg-white text-[#0b2545] hover:bg-slate-100 hover:text-[#0b2545] font-semibold">
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, @instagram ou whatsapp"
          className="pl-9 bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          { id: "all", label: `Todos (${counts.all})`, icon: <Users className="h-3.5 w-3.5" /> },
          { id: "demo", label: `Demonstração (${counts.demo})`, icon: <Play className="h-3.5 w-3.5" /> },
          { id: "indicacao", label: `Indicação (${counts.indic})`, icon: <Gift className="h-3.5 w-3.5" /> },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setKindFilter(t.id as any)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
              kindFilter === t.id
                ? "bg-[#00abfb] text-slate-900 border-[#00abfb] font-semibold"
                : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Data</th>
              <th className="text-left px-4 py-3">Origem</th>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Instagram</th>
              <th className="text-left px-4 py-3">WhatsApp</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Carregando…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                {leads.length === 0 ? "Nenhum lead capturado ainda." : "Nenhum lead encontrado para a busca."}
              </td></tr>
            )}
            {filtered.map((l) => (
              <tr key={l.id} className="hover:bg-slate-800/40 transition">
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(l.created_at)}</td>
                <td className="px-4 py-3">
                  {l.kind === "indicacao" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                      <Gift className="h-3 w-3 mr-1" /> Indicação
                      {l.referral_code ? <span className="ml-1 font-mono opacity-80">· {l.referral_code.replace(/^PHONEE-/, "")}</span> : null}
                    </Badge>
                  ) : (
                    <Badge className="bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px]">
                      <Play className="h-3 w-3 mr-1" /> Demonstração
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-100 font-medium">{l.name}</td>
                <td className="px-4 py-3">
                  <a href={instagramLink(l.instagram)} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1.5 text-[#e1306c] hover:underline">
                    <Instagram className="h-3.5 w-3.5" />
                    @{l.instagram.replace(/^@+/, "")}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <a href={whatsappPitchLink(l.whatsapp)} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1.5 text-[#25d366] hover:underline">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {formatWhats(l.whatsapp)}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(l.id)}
                    className="text-slate-400 hover:text-red-400 hover:bg-red-500/10 h-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {loading && <div className="text-center text-slate-500 py-6">Carregando…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-slate-500 py-6">
            {leads.length === 0 ? "Nenhum lead capturado ainda." : "Nenhum lead encontrado."}
          </div>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-100 truncate">{l.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {l.kind === "indicacao" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px]">
                      <Gift className="h-3 w-3 mr-1" /> Indicação
                    </Badge>
                  ) : (
                    <Badge className="bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px]">
                      <Play className="h-3 w-3 mr-1" /> Demonstração
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
                    {formatDate(l.created_at)}
                  </Badge>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(l.id)}
                className="text-slate-400 hover:text-red-400 h-8 px-2 shrink-0">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <a href={instagramLink(l.instagram)} target="_blank" rel="noreferrer"
               className="flex items-center gap-2 text-sm text-[#e1306c]">
              <Instagram className="h-4 w-4" /> @{l.instagram.replace(/^@+/, "")}
              <ExternalLink className="h-3 w-3 opacity-60 ml-auto" />
            </a>
            <a href={whatsappPitchLink(l.whatsapp)} target="_blank" rel="noreferrer"
               className="flex items-center gap-2 text-sm text-[#25d366]">
              <MessageCircle className="h-4 w-4" /> {formatWhats(l.whatsapp)}
              <ExternalLink className="h-3 w-3 opacity-60 ml-auto" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}