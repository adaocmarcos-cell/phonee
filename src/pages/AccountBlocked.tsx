import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, MessageCircle, Sparkles } from "lucide-react";
import blockedImg from "@/assets/blocked-illustration.png";

export default function AccountBlocked() {
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("my_access_block_status" as any);
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.store_name) setStoreName(row.store_name as string);
    })();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/entrar", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="max-w-xl w-full rounded-2xl border border-border bg-surface/40 backdrop-blur p-6 sm:p-10 text-center shadow-xl">
        <img
          src={blockedImg}
          alt=""
          width={144}
          height={144}
          loading="lazy"
          className="mx-auto h-32 w-32 sm:h-36 sm:w-36 mb-4 select-none"
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Olá! Que bom ter você por aqui <span aria-hidden>💙</span>
        </h1>
        {storeName && (
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
            {storeName}
          </p>
        )}
        <div className="mt-5 space-y-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
          <p>
            Seu período de acesso ao <strong className="text-foreground">Phonee</strong> chegou
            ao fim, mas a gente não quer que sua loja pare!
          </p>
          <p>
            Para continuar aproveitando tudo o que o Phonee oferece — vendas, estoque,
            ordens de serviço e muito mais — é só escolher o plano ideal para você.
          </p>
          <p>
            Seus dados estão guardados com segurança e ficam prontinhos esperando por
            você. <span aria-hidden>😉</span>
          </p>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => navigate("/comprar")}
            className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            <Sparkles className="h-4 w-4" />
            Escolher meu plano
          </Button>
          <a
            href="https://wa.me/5511999999999?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20meu%20acesso%20ao%20Phonee"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <MessageCircle className="h-4 w-4" />
            Falar com o suporte
          </a>
        </div>

        <div className="mt-8 pt-5 border-t border-border/60">
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-danger transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}