import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sparkles, ShieldCheck, Clock, ArrowRight, Check, Store, MapPin, Instagram, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

type Props = { open: boolean; onOpenChange: (v: boolean) => void };

export function FreeTrialSignupDialog({ open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [storeName, setStoreName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) return toast.error("Informe o nome da loja.");
    if (!fullName.trim()) return toast.error("Informe seu nome.");
    if (!email.trim()) return toast.error("Informe seu e-mail.");
    if (whatsapp.replace(/\D/g, "").length < 10) return toast.error("WhatsApp inválido.");
    if (!instagram.trim()) return toast.error("Informe o @ do Instagram.");
    if (!city.trim()) return toast.error("Informe sua cidade.");
    if (!state) return toast.error("Selecione o estado (UF).");
    if (password.length < 8) return toast.error("Senha mínima de 8 caracteres.");

    setLoading(true);
    const { data, error } = await supabase.functions.invoke("free-trial-signup", {
      body: {
        store_name: storeName,
        full_name: fullName,
        email,
        whatsapp,
        instagram,
        city,
        state,
        password,
      },
    });
    setLoading(false);

    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Falha ao criar conta.");
    }
    setDone(true);
    toast.success("Conta criada! Acesso liberado por 7 dias.");
  };

  const reset = () => {
    setDone(false);
    setStoreName(""); setFullName(""); setEmail(""); setWhatsapp("");
    setInstagram(""); setCity(""); setState(""); setPassword("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Experimente grátis por 7 dias
          </DialogTitle>
          <DialogDescription>
            Acesso completo ao Phonee — sem cartão, sem cobrança.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" /> Cadastro concluído
              </div>
              <p className="mt-1.5 text-foreground/80 leading-relaxed">
                Seu acesso ao Phonee foi liberado por <b>7 dias</b>. Após esse período, será
                necessário contratar um plano para continuar utilizando a plataforma.
              </p>
            </div>
            <Link to="/entrar" className="block">
              <Button className="w-full h-11 bg-gradient-primary">
                Acessar o Phonee agora <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <Label className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5 text-primary" /> Nome da loja *</Label>
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Ex: Loja do João Celulares" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Seu nome *</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp *</Label>
                  <Input placeholder="(11) 9 9999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </div>
                <div>
                  <Label className="flex items-center gap-1.5"><Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram *</Label>
                  <Input placeholder="@sua_loja" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <div>
                  <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-info" /> Cidade *</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <Label>UF *</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Senha de acesso *</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-[12px] text-foreground/80 flex gap-2">
              <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                Acesso liberado por <b>7 dias</b>. Após esse período, o acesso é bloqueado automaticamente
                e a continuidade exige a contratação de um plano (<b>Anual</b> ou <b>Vitalício</b>).
              </span>
            </div>

            <Button type="submit" disabled={loading} size="lg" className="w-full h-12 bg-gradient-primary shadow-glow">
              {loading ? "Criando acesso..." : (<>Liberar meus 7 dias grátis <ArrowRight className="ml-1.5 h-4 w-4" /></>)}
            </Button>

            <div className="flex items-center justify-center gap-2 text-[11px] text-foreground/60">
              <ShieldCheck className="h-3 w-3" /> Sem cartão · Sem cobrança · Cancelamento automático
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}