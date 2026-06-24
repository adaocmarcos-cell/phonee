import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Gift, DollarSign, Copy, Check, Link as LinkIcon, Clock, ShieldCheck,
  MessageCircle, ArrowRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";

const BASE_URL =
  typeof window !== "undefined" ? window.location.origin : "https://phonee.com.br";

function shortCode(full: string | null | undefined) {
  if (!full) return "";
  return full.replace(/^PHONEE-/, "");
}

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function LandingReferralSignupDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [done, setDone] = useState(false);
  const [code, setCode] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pixType, setPixType] = useState<string>("cpf");
  const [pixKey, setPixKey] = useState("");
  const [savingPix, setSavingPix] = useState(false);

  // If the visitor is already logged in, jump straight to "get the link" flow.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setCheckingSession(true);
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        await ensureCode();
      }
      setCheckingSession(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ensureCode = async () => {
    try {
      const { data: gen } = await supabase.rpc("generate_referral_code");
      const c = (typeof gen === "string" ? gen : "") as string;
      if (c) {
        setCode(c);
        setDone(true);
        return c;
      }
      const { data: dash } = await supabase.rpc("referral_dashboard");
      const c2 = ((dash as any)?.code ?? "") as string;
      setCode(c2);
      if (c2) setDone(true);
      return c2;
    } catch (e: any) {
      return "";
    }
  };

  const reset = () => {
    setDone(false); setCode(""); setName(""); setEmail(""); setPassword("");
    setWhatsapp(""); setPixType("cpf"); setPixKey(""); setCopied(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      // keep success state if already done; just close
    }
    onOpenChange(v);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || !pixKey.trim()) {
      toast.error("Preencha nome, e-mail, senha e chave PIX.");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = `${BASE_URL}/`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: name.trim() },
        },
      });
      if (error) throw error;

      // If autoconfirm is off, no session — try sign-in (works when autoconfirm IS on too).
      if (!data.session) {
        const { error: e2 } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (e2) {
          // Email confirmation required → instruct user
          toast.success("Conta criada! Verifique seu e-mail para confirmar e fazer login.");
          onOpenChange(false);
          return;
        }
      }

      // Update profile with phone + PIX info
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({
          full_name: name.trim(),
          phone: whatsapp.trim() || null,
          pix_key: pixKey.trim(),
          pix_type: pixType,
        }).eq("id", user.id);
      }

      const c = await ensureCode();
      if (!c) {
        toast.error("Conta criada, mas não foi possível gerar o código. Acesse o painel para tentar de novo.");
        return;
      }
      toast.success("Tudo pronto! Seu link de indicação está abaixo.");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  const shareCode = shortCode(code);
  const link = shareCode ? `${BASE_URL}/comprar?ref=${shareCode}` : "";
  const waMsg = link
    ? `Olá! Te indiquei a Phonee — sistema completo para lojas de smartphones e assistências. Cadastre-se pelo meu link e ganhe vantagens: ${link}`
    : "";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const savePix = async () => {
    if (!pixKey.trim()) {
      toast.error("Informe a chave PIX.");
      return;
    }
    setSavingPix(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada.");
      const { error } = await supabase.from("profiles").update({
        pix_key: pixKey.trim(),
        pix_type: pixType,
      }).eq("id", user.id);
      if (error) throw error;
      toast.success("Chave PIX salva!");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar chave PIX.");
    } finally {
      setSavingPix(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <DollarSign className="h-4 w-4" />
            </span>
            Indique e Ganhe — R$ 10 por assinatura
          </DialogTitle>
          <DialogDescription>
            Cadastro rápido. Ganhe R$ 10 a cada nova assinatura confirmada pelo seu link.
          </DialogDescription>
        </DialogHeader>

        {checkingSession ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : !done ? (
          <form onSubmit={submit} className="space-y-3 mt-1">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80 leading-relaxed">
                <b>Como funciona:</b> compartilhe seu link. A cada novo assinante,
                R$ 10 são creditados e <b>liberados 7 dias após a compra</b> do indicado,
                pagos via PIX na chave informada abaixo.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <div className="space-y-1">
                <Label className="text-xs">Nome completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Como prefere ser chamado(a)" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp</Label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Senha (mín. 6)</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required minLength={6} />
              </div>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo PIX</Label>
                  <Select value={pixType} onValueChange={setPixType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="aleatoria">Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Chave PIX (para receber)</Label>
                  <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave PIX" required />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary shadow-glow">
              {loading ? "Criando conta…" : (<>Quero indicar e ganhar <ArrowRight className="h-4 w-4 ml-1.5" /></>)}
            </Button>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Dados criptografados</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Liberação em 7 dias</span>
            </div>
          </form>
        ) : (
          <div className="space-y-4 mt-1">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-start gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/80 leading-relaxed">
                Seu prêmio será pago via PIX na chave cadastrada,
                <b> 7 dias após cada nova assinatura</b> confirmada pelo seu link.
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5" /> Seu código de indicador
              </Label>
              <div className="flex gap-2">
                <Input readOnly value={shareCode || "—"} className="font-mono tracking-widest uppercase font-bold" />
                <Button type="button" variant="outline" disabled={!shareCode} onClick={() => copy(shareCode, "Código")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> Link de indicação
              </Label>
              <div className="flex gap-2">
                <Input readOnly value={link || "—"} className="text-xs" />
                <Button
                  type="button"
                  disabled={!link}
                  onClick={() => copy(link, "Link")}
                  className="bg-gradient-primary text-primary-foreground shadow-glow hover:brightness-110"
                >
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Insira a chave PIX que deseja receber o prêmio
              </Label>
              <div className="flex gap-2">
                <Select value={pixType} onValueChange={setPixType}>
                  <SelectTrigger className="w-[96px] h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="aleatoria">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Sua chave PIX"
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  disabled={savingPix}
                  onClick={savePix}
                >
                  {savingPix ? "..." : "Salvar"}
                </Button>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!link}
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, "_blank")}
            >
              <MessageCircle className="h-4 w-4 mr-1.5 text-emerald-600" /> Compartilhar no WhatsApp
            </Button>

            <div className="flex items-center justify-between pt-1">
              <Badge variant="secondary" className="text-[10px] leading-tight">
                Bônus liberado em 7 dias após confirmação de pagamento do seu indicado
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); reset(); }}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}