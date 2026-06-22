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
  variant?: "default" | "filled" | "highlight";
  className?: string;
}

const accentBg: Record<NonNullable<Props["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function MetricCard({ label, value, delta, trend = "flat", icon: Icon, accent = "primary", variant = "default", className }: Props) {
  const filled = variant === "filled" || variant === "highlight";
  const highlight = variant === "highlight";

  const trendColor = filled
    ? "text-primary-foreground/80"
    : trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-muted-foreground";

  const cardCls = filled
    ? "bg-primary text-primary-foreground border-primary shadow-glow hover:brightness-110 transition-all"
    : "bg-card border-border shadow-card hover:border-primary/40 transition-colors";

  const iconCls = filled
    ? "bg-primary-foreground/15 text-primary-foreground"
    : accentBg[accent];

  const labelCls = filled
    ? "text-primary-foreground/85"
    : "text-muted-foreground";

  return (
    <Card className={cn("p-5", cardCls, highlight && "p-7", className)}>
      <div className="flex items-start justify-between mb-3">
        <span className={cn("text-[11px] uppercase tracking-widest font-mono", labelCls)}>{label}</span>
        <div className={cn("rounded-md flex items-center justify-center", highlight ? "h-10 w-10" : "h-8 w-8", iconCls)}>
          <Icon className={cn(highlight ? "h-5 w-5" : "h-4 w-4")} />
        </div>
      </div>
      <div className={cn(
        "metric font-bold leading-tight",
        highlight ? "text-5xl" : filled ? "text-4xl" : "text-3xl"
      )}>
        {value}
      </div>
      {delta && <div className={cn("text-xs mt-2 font-mono", trendColor)}>{delta}</div>}
    </Card>
  );
}