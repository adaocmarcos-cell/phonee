import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logoAsset from "@/assets/phonee-logo-white.png.asset.json";

export default function PhoneeLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", user.id).eq("role", "admin_master").maybeSingle();
      if (data) nav("/phonee/visao-geral", { replace: true });
    })();
  }, [nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      toast.error("Credenciais inválidas");
      return;
    }
    const { data: role } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", data.user.id).eq("role", "admin_master").maybeSingle();
    setLoading(false);
    if (!role) {
      await supabase.auth.signOut();
      toast.error("Acesso restrito ao gestor da plataforma.");
      return;
    }
    nav("/phonee/visao-geral", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-7 shadow-2xl"
      >
        <div className="text-center flex flex-col items-center">
          <img src={logoAsset.url} alt="Phonee" className="h-10 w-auto" />
          <div className="mt-2 text-xs uppercase tracking-widest text-slate-400">
            Painel do Gestor da Plataforma
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-slate-300">E-mail</Label>
          <Input id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-slate-800 border-slate-700 text-slate-100" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className="text-slate-300">Senha</Label>
          <Input id="password" type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-slate-800 border-slate-700 text-slate-100" />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-[#00abfb] hover:bg-[#00abfb]/90 text-slate-900 font-semibold">
          {loading ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-[11px] text-center text-slate-500">
          Área restrita. Acessos são auditados.
        </p>
      </form>
    </div>
  );
}