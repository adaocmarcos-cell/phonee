import { useState, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { z } from "zod";
import logo from "@/assets/smartstock-icon.png";
import { Boxes, Zap, ShieldCheck } from "lucide-react";

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passwordSchema = z.string().min(6, "Mínimo 6 caracteres").max(72);
const nameSchema = z.string().trim().min(2, "Informe seu nome").max(80);

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  if (loading) return null;
  if (user) return <Navigate to="/app" replace />;

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    const eRes = emailSchema.safeParse(email);
    const pRes = passwordSchema.safeParse(password);
    if (!eRes.success) return toast.error(eRes.error.issues[0].message);
    if (!pRes.success) return toast.error(pRes.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: eRes.data, password: pRes.data });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate("/app");
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    const nRes = nameSchema.safeParse(fullName);
    const eRes = emailSchema.safeParse(email);
    const pRes = passwordSchema.safeParse(password);
    if (!nRes.success) return toast.error(nRes.error.issues[0].message);
    if (!eRes.success) return toast.error(eRes.error.issues[0].message);
    if (!pRes.success) return toast.error(pRes.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: eRes.data,
      password: pRes.data,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: nRes.data },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Sua loja foi provisionada.");
    navigate("/app");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden bg-gradient-surface border-r border-border">
        <div className="absolute inset-0 bg-grid opacity-[0.18] pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <img src={logo} alt="SmartStock" width={40} height={40} className="h-10 w-10" />
            <div>
              <div className="text-lg font-bold tracking-tight">SmartStock</div>
              <div className="text-[11px] font-mono text-muted-foreground tracking-widest">ERP · SMARTPHONES</div>
            </div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Inteligência de estoque para lojas que <span className="text-primary">não podem perder venda</span>.
          </h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3"><Boxes className="h-4 w-4 text-primary mt-0.5" /> Curva ABC e regra 80/20 calculadas automaticamente</li>
            <li className="flex gap-3"><Zap className="h-4 w-4 text-success mt-0.5" /> Alertas de ruptura, encalhe e crediário em tempo real</li>
            <li className="flex gap-3"><ShieldCheck className="h-4 w-4 text-warning mt-0.5" /> Controle de seminovos, IMEI e checklist com fotos</li>
          </ul>
        </div>
        <div className="relative text-[11px] font-mono text-muted-foreground tracking-widest">© SMARTSTOCK · 2026</div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 bg-card border-border shadow-card">
          <div className="mb-6 lg:hidden flex items-center gap-3">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="text-lg font-bold">SmartStock</span>
          </div>
          <h1 className="text-2xl font-bold mb-1">Acesse sua loja</h1>
          <p className="text-sm text-muted-foreground mb-6">Entre ou crie sua conta para começar.</p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@loja.com" autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-glow">
                  {busy ? "Entrando…" : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Seu nome</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" autoComplete="name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">E-mail</Label>
                  <Input id="email2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Senha</Label>
                  <Input id="password2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                  <p className="text-[11px] text-muted-foreground">Mínimo 6 caracteres.</p>
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-glow">
                  {busy ? "Criando…" : "Criar minha loja"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Ao criar, você vira o <strong className="text-foreground">dono</strong> da sua loja no SmartStock.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}