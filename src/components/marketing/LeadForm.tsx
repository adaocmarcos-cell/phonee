import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getUtms } from "@/lib/utmTracking";
import { trackMetaEvent } from "@/lib/metaPixel";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  whatsapp: z
    .string()
    .trim()
    .min(10, "WhatsApp inválido")
    .max(20, "WhatsApp inválido"),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  nome_loja: z.string().trim().max(160).optional().or(z.literal("")),
});

function maskWhatsapp(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function LeadForm({ origem_pagina }: { origem_pagina?: string }) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cidade, setCidade] = useState("");
  const [nome_loja, setNomeLoja] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ nome, whatsapp, cidade, nome_loja });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Verifique os campos");
      return;
    }
    setLoading(true);
    try {
      const utms = getUtms();
      const { error: err } = await (supabase as any).from("leads").insert({
        nome: parsed.data.nome,
        whatsapp: parsed.data.whatsapp,
        cidade: parsed.data.cidade || null,
        nome_loja: parsed.data.nome_loja || null,
        utm_source: utms.utm_source ?? null,
        utm_medium: utms.utm_medium ?? null,
        utm_campaign: utms.utm_campaign ?? null,
        utm_content: utms.utm_content ?? null,
        utm_term: utms.utm_term ?? null,
        origem_pagina: origem_pagina ?? (typeof window !== "undefined" ? window.location.pathname : null),
      });
      if (err) throw err;
      trackMetaEvent("Lead", { custom: { origem_pagina } });
      setDone(true);
    } catch (err: any) {
      setError("Não conseguimos enviar agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl border-2 border-success/40 bg-success/10 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-success" />
        <h3 className="text-xl font-extrabold text-foreground">
          Recebemos seus dados!
        </h3>
        <p className="mt-2 text-foreground/80">
          Vamos te chamar no WhatsApp em breve para montar o teste do sistema
          na sua loja.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="lead-nome">Seu nome</Label>
        <Input
          id="lead-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: João Silva"
          autoComplete="name"
          required
        />
      </div>
      <div>
        <Label htmlFor="lead-wa">WhatsApp</Label>
        <Input
          id="lead-wa"
          value={whatsapp}
          onChange={(e) => setWhatsapp(maskWhatsapp(e.target.value))}
          placeholder="(31) 99999-9999"
          inputMode="tel"
          autoComplete="tel"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-cidade">Cidade</Label>
          <Input
            id="lead-cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Ex.: Divinópolis - MG"
          />
        </div>
        <div>
          <Label htmlFor="lead-loja">Nome da loja</Label>
          <Input
            id="lead-loja"
            value={nome_loja}
            onChange={(e) => setNomeLoja(e.target.value)}
            placeholder="Ex.: JS Celulares"
          />
        </div>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…
          </>
        ) : (
          "Quero testar na minha loja"
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Seus dados estão seguros. Sem spam — usamos só para te chamar no WhatsApp.
      </p>
    </form>
  );
}