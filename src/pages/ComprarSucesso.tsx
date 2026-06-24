import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/phonee-logo.png.asset.json";

export default function ComprarSucesso() {
  const { id } = useParams();
  const [sub, setSub] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const fetchSub = async () => {
      const { data, error } = await supabase.functions.invoke("asaas-check-status", {
        body: { subscription_id: id },
      });
      if (!error && data && !(data as any).error) setSub(data);
    };
    fetchSub();
    const interval = setInterval(fetchSub, 5000);
    return () => clearInterval(interval);
  }, [id]);

  if (!sub) return <div className="min-h-screen flex items-center justify-center bg-[hsl(226_50%_15%)] text-white"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const active = sub.status === "active";
  const isPix = sub.payment_method === "PIX";

  return (
    <div className="min-h-screen bg-[hsl(226_50%_15%)] text-white">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-white/70 hover:text-white">← Voltar</Link>
          <div className="bg-white rounded-xl px-4 py-1.5"><img src={logoAsset.url} alt="Phonee" className="h-8 w-auto" /></div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-5 py-10">
        <Card className="p-8 bg-[hsl(224_25%_18%)] border border-white/15 text-white">
          {active ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-success mx-auto" />
              <h1 className="text-3xl font-extrabold">Pagamento confirmado!</h1>
              <p className="text-white/80">Enviamos um e-mail para <strong>{sub.customer_email}</strong> com o link para você definir sua senha e acessar o Phonee.</p>
              <Link to="/entrar"><Button size="lg" className="bg-gradient-primary shadow-glow">Ir para o login</Button></Link>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-extrabold">Conclua seu pagamento</h1>
                <Badge className="bg-warning/20 text-warning border-warning/40">Aguardando</Badge>
              </div>
              {isPix && sub.pix_qr_code ? (
                <div className="space-y-4 text-center">
                  <p className="text-white/80">Abra o app do seu banco, escolha PIX → QR Code e aponte para o código:</p>
                  <div className="inline-block bg-white p-3 rounded-xl">
                    <img src={`data:image/png;base64,${sub.pix_qr_code}`} alt="QR Code PIX" className="h-64 w-64" />
                  </div>
                  {sub.pix_copy_paste && (
                    <div className="space-y-2">
                      <div className="text-sm text-white/70">PIX copia e cola:</div>
                      <div className="flex gap-2">
                        <input readOnly value={sub.pix_copy_paste} className="flex-1 bg-white/5 border border-white/15 rounded px-3 py-2 text-xs" />
                        <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(sub.pix_copy_paste); toast.success("Copiado!"); }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-white/60">A página atualiza automaticamente assim que o pagamento for confirmado.</p>
                </div>
              ) : (
                <div className="space-y-4 text-center">
                  <p className="text-white/80">Acesse a página segura do Asaas para concluir o pagamento com cartão:</p>
                  {sub.invoice_url && (
                    <a href={sub.invoice_url} target="_blank" rel="noreferrer">
                      <Button size="lg" className="bg-gradient-primary shadow-glow">
                        Pagar com cartão <ExternalLink className="ml-2 h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}