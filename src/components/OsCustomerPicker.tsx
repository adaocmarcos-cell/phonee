import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserSearch, X, Link2 } from "lucide-react";

type Customer = {
  id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address_city?: string | null;
  address_street?: string | null;
};

export function OsCustomerPicker({
  storeId,
  value,
  os,
  onLink,
  onUnlink,
}: {
  storeId: string;
  value?: string | null;
  os: any;
  onLink: (c: Customer) => void;
  onUnlink: () => void;
}) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Customer | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) { setCurrent(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("customers")
        .select("id,name,document,phone,whatsapp,email,address_city,address_street")
        .eq("id", value)
        .maybeSingle();
      if (data) setCurrent(data as Customer);
    })();
  }, [value]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = term.trim();
      if (q.length < 2) { setRows([]); return; }
      const { data } = await (supabase as any)
        .from("customers")
        .select("id,name,document,phone,whatsapp,email,address_city,address_street")
        .eq("store_id", storeId)
        .or(`name.ilike.%${q}%,document.ilike.%${q}%,whatsapp.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(8);
      setRows((data as Customer[]) ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [term, storeId]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (current) {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="border-primary/40 text-primary">
              <Link2 className="h-3 w-3 mr-1" />Cliente vinculado
            </Badge>
            <span className="font-semibold text-sm truncate">{current.name}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {[current.document, current.whatsapp || current.phone, current.email].filter(Boolean).join(" · ") || "Sem dados de contato"}
          </div>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onUnlink} title="Desvincular">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center gap-2 flex-wrap">
        <UserSearch className="h-4 w-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente por nome, CPF ou WhatsApp…"
          className="flex-1 min-w-[240px]"
        />
        <span className="text-xs text-muted-foreground">
          Vincule para consolidar histórico e futuras OS.
        </span>
      </div>
      {open && rows.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {rows.map((c) => (
            <button
              type="button"
              key={c.id}
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border last:border-0"
              onClick={() => { onLink(c); setOpen(false); setTerm(""); }}
            >
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground">
                {[c.document, c.whatsapp || c.phone, c.email].filter(Boolean).join(" · ") || "—"}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && term.length >= 2 && rows.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover p-3 text-xs text-muted-foreground">
          Nenhum cliente encontrado. Preencha os campos manualmente ou cadastre em Clientes.
        </div>
      )}
    </div>
  );
}