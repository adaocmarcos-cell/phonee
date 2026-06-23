import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { z } from "zod";
import logoAsset from "@/assets/mobileplus-logo.png.asset.json";
const logo = logoAsset.url;

const emailSchema = z.string().trim().email("E-mail inválido").max(255);

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    const r = emailSchema.safeParse(email);
    if (!r.success) return toast.error(r.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(r.data, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("E-mail de recuperação enviado.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md p-8 bg-card border-border shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-lg font-bold">Mobile+</span>
        </div>
        <h1 className="text-2xl font-bold mb-1">Esqueceu sua senha?</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Informe seu e-mail e enviaremos um link para redefinir.
        </p>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm">Se o e-mail existir, você receberá as instruções em instantes.</p>
            <Link to="/entrar" className="text-sm text-primary hover:underline">Voltar ao login</Link>
          </div>
        ) : (
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-primary shadow-glow">
              {busy ? "Enviando…" : "Enviar link de recuperação"}
            </Button>
            <div className="text-center">
              <Link to="/entrar" className="text-sm text-muted-foreground hover:text-foreground">Voltar ao login</Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}