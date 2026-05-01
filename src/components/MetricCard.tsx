import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon: LucideIcon;
  accent?: "primary" | "success" | "warning" | "danger";
}

const accentBg: Record<NonNullable<Props["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function MetricCard({ label, value, delta, trend = "flat", icon: Icon, accent = "primary" }: Props) {
  const trendColor =
    trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-muted-foreground";
  return (
    <Card className="p-5 bg-card border-border shadow-card hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-[11px] uppercase tracking-widest font-mono text-muted-foreground">{label}</span>
        <div className={cn("h-8 w-8 rounded-md flex items-center justify-center", accentBg[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="metric text-2xl font-bold">{value}</div>
      {delta && <div className={cn("text-xs mt-1 font-mono", trendColor)}>{delta}</div>}
    </Card>
  );
}