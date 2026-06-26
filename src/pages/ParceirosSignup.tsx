import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { trackMetaEvent } from "@/lib/metaPixel";

export default function ParceirosSignup() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    whatsapp: "",
    password: "",
    instagram: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("partner-self-signup", { body: form });
    setLoading(false);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error || error?.message || "Falha no cadastro.");
    }
    setDone(true);
    toast.success("Cadastro aprovado! Acesso liberado por 7 dias.");
    trackMetaEvent("Lead", {
      email: form.email,
      phone: form.whatsapp,
      custom: { content_name: "partner_signup", instagram: form.instagram },
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="max-w-5xl mx-auto px-5 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img src="/phonee-logo-parceiros.png" alt="Phonee" className="h-8 w-auto" />
        </Link>
        <Link to="/entrar" className="text-sm text-slate-300 hover:text-white">Já tenho conta →</Link>
      </header>

      <main className="max-w-5xl mx-auto px-5 pb-16 grid md:grid-cols-2 gap-10 items-center">
        <section className="flex items-center justify-center md:justify-start">
          <p className="text-2xl md:text-3xl font-medium text-slate-100 leading-snug">
            Página exclusiva para parceiros Phonee.
          </p>
        </section>

        <section className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 shadow-xl">
          {done ? (
            <div className="text-center space-y-4 py-4">
              <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 grid place-items-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold">Cadastro aprovado!</h2>
              <p className="text-sm text-slate-300">
                Sua avaliação de 7 dias começou. Use seu e-mail e senha para entrar agora.
              </p>
              <Button onClick={() => nav("/entrar")} className="bg-sky-600 hover:bg-sky-700">
                Entrar no Phonee <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-lg font-semibold">Cadastro de Parceiro</h2>
              <div>
                <Label>Nome completo *</Label>
                <Input value={form.full_name} onChange={set("full_name")} required />
              </div>
              <div>
                <Label>E-mail *</Label>
                <Input type="email" value={form.email} onChange={set("email")} required />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp} onChange={set("whatsapp")} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <Label>Senha de acesso *</Label>
                <Input type="password" minLength={8} value={form.password} onChange={set("password")} required />
                <p className="text-[11px] text-slate-400 mt-1">Mínimo 8 caracteres.</p>
              </div>
              <div>
                <Label>Instagram</Label>
                <Input value={form.instagram} onChange={set("instagram")} placeholder="@usuario" />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-sky-600 hover:bg-sky-700">
                {loading ? "Enviando..." : "Cadastrar"}
              </Button>
              <p className="text-[11px] text-slate-500 text-center">
                Ao cadastrar, você concorda em receber contato do time Phonee.
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
