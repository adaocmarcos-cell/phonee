import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_CATALOG } from "@/lib/roles";
import { Crown, ShieldCheck } from "lucide-react";

export default function Cargos() {
  return (
    <div>
      <PageHeader
        title="Cargos e Funções"
        description="Cargos padrão do Phonee. Cada cargo possui um conjunto de permissões editável em Permissões."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ROLE_CATALOG.map((r) => {
          const master = r.value === "admin_master";
          return (
            <Card key={r.value} className={`p-4 bg-card border ${master ? "border-primary/50 shadow-glow" : "border-border"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {master ? <Crown className="h-5 w-5 text-primary" /> : <ShieldCheck className="h-5 w-5 text-muted-foreground" />}
                  <h3 className="font-semibold">{r.label}</h3>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">Nível {r.hierarchy}</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-4">
        Cargos customizados poderão ser criados quando a matriz de permissões for ativada (próxima fase).
      </p>
    </div>
  );
}