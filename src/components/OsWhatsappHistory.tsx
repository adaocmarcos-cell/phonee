import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, RefreshCw, ExternalLink } from "lucide-react";
import { WHATSAPP_EVENTS, buildWaMeUrl } from "@/lib/whatsappTemplates";

type Row = {
  id: string;
  event_key: string;
  template_title: string | null;
  phone: string | null;
  message_text: string;
  created_at: string;
  sent_by: string | null;
};

export function OsWhatsappHistory({ osId }: { osId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<Record<string, string>>({});

  const load = async () => {
    if (!osId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("whatsapp_messages_log")
      .select("id,event_key,template_title,phone,message_text,created_at,sent_by")
      .eq("os_id", osId)
      .order("created_at", { ascending: false });
    const list = (data || []) as Row[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.sent_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const m: Record<string, string> = {};
      (profs || []).forEach((p: any) => { m[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
      setPeople(m);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [osId]);

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-success" />
          <h3 className="font-semibold text-sm">Histórico de mensagens WhatsApp</h3>
          <Badge variant="outline" className="text-[10px] font-mono">{rows.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma mensagem enviada por esta OS.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const meta = WHATSAPP_EVENTS.find((e) => e.key === r.event_key);
            return (
              <li key={r.id} className="rounded-md border border-border p-2.5 bg-background/40">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="text-[10px]">{meta?.label || r.event_key}</Badge>
                    <span className="text-muted-foreground truncate">
                      {r.template_title || "—"} · {r.phone || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </span>
                    {r.phone && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        title="Reabrir no WhatsApp"
                        onClick={() => window.open(buildWaMeUrl(r.phone!, r.message_text), "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Enviado por <span className="text-foreground">{r.sent_by ? (people[r.sent_by] ?? r.sent_by.slice(0, 8)) : "—"}</span>
                </div>
                <details className="mt-1">
                  <summary className="text-[11px] text-primary cursor-pointer">Ver mensagem</summary>
                  <pre className="mt-1 whitespace-pre-wrap text-[11px] font-mono bg-muted/40 p-2 rounded">{r.message_text}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}