import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type LogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  role: string | null;
  module: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: any;
  status: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  dono: "Dono",
  gerente: "Gerente",
  vendedor: "Vendedor",
  tecnico: "Técnico",
  estoquista: "Estoquista",
  financeiro: "Financeiro",
  atendimento: "Atendimento",
  administrador: "Administrador",
  admin_master: "Admin Master",
};

export default function LogsPage() {
  const { store } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; email: string; role: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const { data: logs } = await supabase
      .from("audit_log")
      .select("id, created_at, user_id, role, module, action, entity, entity_id, details, status")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false })
      .limit(500);
    const list = (logs ?? []) as LogRow[];

    const uids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
    if (uids.length) {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", uids),
        supabase.from("user_roles").select("user_id, role").eq("store_id", store.id).in("user_id", uids),
      ]);
      const roleMap = new Map<string, string>();
      (roles ?? []).forEach((r: any) => roleMap.set(r.user_id, r.role));
      const map: Record<string, { name: string; email: string; role: string | null }> = {};
      (profs ?? []).forEach((p: any) => {
        map[p.id] = { name: p.full_name || p.email || "—", email: p.email || "", role: roleMap.get(p.id) ?? null };
      });
      setProfiles(map);
    }
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [store]);

  const modules = useMemo(() => Array.from(new Set(rows.map((r) => r.module).filter(Boolean))) as string[], [rows]);
  const roles = useMemo(() => Array.from(new Set(Object.values(profiles).map((p) => p.role).filter(Boolean))) as string[], [profiles]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (moduleFilter !== "all" && r.module !== moduleFilter) return false;
    const userRole = (r.user_id && profiles[r.user_id]?.role) || r.role;
    if (roleFilter !== "all" && userRole !== roleFilter) return false;
    if (q) {
      const u = r.user_id ? profiles[r.user_id] : null;
      const hay = `${r.action} ${r.module ?? ""} ${r.entity ?? ""} ${u?.name ?? ""} ${u?.email ?? ""} ${JSON.stringify(r.details ?? {})}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, profiles, q, moduleFilter, roleFilter]);

  return (
    <div>
      <PageHeader
        title="Logs e Auditoria"
        description="Histórico de ações de cada usuário do sistema · Mobile+"
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
          </Button>
        }
      />

      <Card className="p-3 mb-4 flex flex-col md:flex-row gap-2">
        <Input
          className="flex-1"
          placeholder="Buscar por usuário, ação, módulo ou detalhe…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os módulos</SelectItem>
            {modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="md:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cargos</SelectItem>
            {roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-elevated text-[11px] uppercase tracking-widest font-mono text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Quando</th>
                <th className="text-left px-4 py-3 font-medium">Usuário</th>
                <th className="text-left px-4 py-3 font-medium">Cargo</th>
                <th className="text-left px-4 py-3 font-medium">Módulo</th>
                <th className="text-left px-4 py-3 font-medium">Ação</th>
                <th className="text-left px-4 py-3 font-medium">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-xs font-mono text-muted-foreground">CARREGANDO…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-muted-foreground">
                  <FileSearch className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  Nenhum log encontrado.
                </td></tr>
              ) : filtered.map((r) => {
                const u = r.user_id ? profiles[r.user_id] : null;
                const role = (u?.role) || r.role;
                return (
                  <tr key={r.id} className="hover:bg-surface-elevated/40">
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{u?.name ?? "Sistema"}</div>
                      {u?.email && <div className="text-[11px] text-muted-foreground font-mono">{u.email}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {role ? <Badge variant="outline" className="border-border text-xs">{ROLE_LABEL[role] ?? role}</Badge> : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.module ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-primary/10 text-primary border-primary/30">{r.action}</Badge>
                      {r.entity && <div className="text-[11px] text-muted-foreground mt-1">{r.entity}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-md">
                      {r.details ? (
                        <pre className="whitespace-pre-wrap font-mono text-[11px]">{
                          Object.entries(r.details as Record<string, any>)
                            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                            .join(" · ")
                        }</pre>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}