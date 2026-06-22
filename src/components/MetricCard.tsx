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
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "violet";
  className?: string;
}

const accentBg: Record<NonNullable<Props["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

const toneGradient: Record<NonNullable<Props["tone"]>, string> = {
  primary: "bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground border-primary/60",
  success: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 text-white border-emerald-500/60",
  warning: "bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600 text-white border-orange-500/60",
  danger:  "bg-gradient-to-br from-rose-500 via-red-600 to-red-700 text-white border-red-500/60",
  info:    "bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 text-white border-blue-500/60",
  violet:  "bg-gradient-to-br from-fuchsia-500 via-purple-600 to-indigo-700 text-white border-purple-500/60",
};

export function MetricCard({ label, value, delta, trend = "flat", icon: Icon, accent = "primary", variant = "default", tone, className }: Props) {
  const filled = variant === "filled" || variant === "highlight";
  const highlight = variant === "highlight";

  const trendColor = tone || filled
    ? "text-white/85"
    : trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-muted-foreground";

  const cardCls = tone
    ? `${toneGradient[tone]} shadow-glow hover:brightness-110 transition-all`
    : filled
    ? "bg-primary text-primary-foreground border-primary shadow-glow hover:brightness-110 transition-all"
    : "bg-card border-border shadow-card hover:border-primary/40 transition-colors";

  const iconCls = tone || filled
    ? "bg-white/20 text-white backdrop-blur-sm"
    : accentBg[accent];

  const labelCls = tone || filled
    ? "text-white/90"
    : "text-muted-foreground";

  return (
    <Card className={cn("p-5", cardCls, highlight && "p-7", className)}>
      <div className="flex items-start justify-between mb-3">
        <span className={cn("text-xs uppercase tracking-widest font-mono font-semibold", labelCls)}>{label}</span>
        <div className={cn("rounded-md flex items-center justify-center", highlight ? "h-10 w-10" : "h-8 w-8", iconCls)}>
          <Icon className={cn(highlight ? "h-5 w-5" : "h-4 w-4")} />
        </div>
      </div>
      <div className={cn(
        "metric font-bold leading-tight",
        highlight ? "text-[2.75rem] md:text-5xl" : filled || tone ? "text-4xl md:text-[2.5rem]" : "text-3xl"
      )}>
        {value}
      </div>
      {delta && <div className={cn("text-sm mt-2 font-mono font-medium", trendColor)}>{delta}</div>}
    </Card>
  );
}