import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, PlayCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Check = { check: string; pass: boolean; detail?: any };
type SmokeReport = {
  pass: boolean;
  as_admin?: string;
  run_at?: string;
  checks: Check[];
};

type RunRow = {
  id: string;
  ran_at: string;
  pass: boolean;
  source: string;
  checks: Check[];
  failed_checks: Check[] | null;
};

function StatusBadge({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800 px-2 py-0.5 text-xs">
      <CheckCircle2 className="h-3.5 w-3.5" /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-950/60 text-red-300 border border-red-800 px-2 py-0.5 text-xs">
      <XCircle className="h-3.5 w-3.5" /> FALHA
    </span>
  );
}

export default function PhoneeDiagnostico() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<SmokeReport | null>(null);
  const [history, setHistory] = useState<RunRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("phonee_smoke_test_runs")
      .select("id, ran_at, pass, source, checks, failed_checks")
      .order("ran_at", { ascending: false })
      .limit(20);
    if (error) toast.error(error.message);
    else setHistory((data ?? []) as unknown as RunRow[]);
    setLoadingHistory(false);
  };

  useEffect(() => { loadHistory(); }, []);

  const runNow = async () => {
    setRunning(true);
    setReport(null);
    try {
      const { data, error } = await supabase.rpc("phonee_smoke_test");
      if (error) throw error;
      const rep = data as unknown as SmokeReport;
      setReport(rep);
      // Persist the run
      const { error: logErr } = await supabase.rpc("phonee_smoke_test_run_and_log", { _source: "manual" });
      if (logErr) toast.error(`Falha ao registrar execução: ${logErr.message}`);
      else toast.success(rep.pass ? "Smoke test OK" : "Smoke test com falhas");
      loadHistory();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao executar smoke test");
    } finally {
      setRunning(false);
    }
  };

  const runSecurityTest = async () => {
    const { data, error } = await supabase.rpc("phonee_security_test");
    if (error) {
      // Expected when caller IS admin_master.
      toast.error(error.message);
      return;
    }
    const rep = data as any;
    toast[rep?.pass ? "success" : "error"](
      rep?.pass ? "Bloqueio confirmado em todas as RPCs" : "Alguma RPC não bloqueou usuário comum"
    );
    console.log("phonee_security_test", rep);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Diagnóstico da plataforma</h1>
          <p className="text-sm text-slate-400 mt-1">
            Executa o <code className="text-slate-300">phonee_smoke_test</code> e mostra o resultado das 16 checagens.
            A execução automática roda a cada 6 horas e fica registrada no histórico.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runNow} disabled={running} className="bg-[#00abfb] text-slate-900 hover:bg-[#00abfb]/90">
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Executar agora
          </Button>
          <Button variant="outline" onClick={runSecurityTest} className="border-slate-700 text-slate-200 hover:bg-slate-800">
            Testar bloqueio (não-admin)
          </Button>
        </div>
      </div>

      {report && (
        <section className="rounded-xl border border-slate-800 bg-slate-900">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <StatusBadge pass={report.pass} />
              <span className="text-sm text-slate-400">
                {report.run_at ? new Date(report.run_at).toLocaleString("pt-BR") : "agora"}
              </span>
            </div>
            <span className="text-xs text-slate-500">
              {report.checks.filter(c => c.pass).length}/{report.checks.length} passaram
            </span>
          </header>
          <ul className="divide-y divide-slate-800">
            {report.checks.map((c, i) => (
              <li key={i} className="px-5 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 font-medium">{c.check}</div>
                  {c.detail && (Object.keys(c.detail).length > 0) && (
                    <pre className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap break-all">
                      {JSON.stringify(c.detail, null, 2)}
                    </pre>
                  )}
                </div>
                <StatusBadge pass={c.pass} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900">
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <div>
            <h2 className="text-slate-100 font-medium">Histórico (últimas 20 execuções)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Fonte inclui execuções agendadas via cron e manuais.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={loadHistory} className="text-slate-300 hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 mr-1 ${loadingHistory ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-2">Quando</th>
                <th className="text-left px-5 py-2">Origem</th>
                <th className="text-left px-5 py-2">Status</th>
                <th className="text-left px-5 py-2">Checagens</th>
                <th className="text-left px-5 py-2">Falhas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {history.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-slate-500 text-center">Sem execuções registradas ainda.</td></tr>
              )}
              {history.map((r) => {
                const total = Array.isArray(r.checks) ? r.checks.length : 0;
                const failed = Array.isArray(r.failed_checks) ? r.failed_checks.length : 0;
                return (
                  <tr key={r.id} className="text-slate-200">
                    <td className="px-5 py-2 whitespace-nowrap">{new Date(r.ran_at).toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2 text-slate-400">{r.source}</td>
                    <td className="px-5 py-2"><StatusBadge pass={r.pass} /></td>
                    <td className="px-5 py-2">{total - failed}/{total}</td>
                    <td className="px-5 py-2 text-slate-400">
                      {failed === 0 ? "—" : (r.failed_checks ?? []).map((c: any) => c.check).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}