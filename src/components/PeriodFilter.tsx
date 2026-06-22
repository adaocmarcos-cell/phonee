import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PeriodValue =
  | "today" | "7d" | "30d" | "90d" | "3m" | "6m" | "month" | "year" | "1y" | "all" | "custom";

export type CustomRange = { from?: Date; to?: Date };

const LABELS: Record<string, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "3m": "3 meses",
  "6m": "6 meses",
  month: "Mês atual",
  year: "Ano atual",
  "1y": "1 ano",
  all: "Tudo",
  custom: "Personalizado",
};

export function PeriodFilter({
  value, onChange, options, custom, onCustomChange, className, compact = false, showLabel = true,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  options: PeriodValue[];
  custom?: CustomRange;
  onCustomChange?: (r: CustomRange) => void;
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
}) {
  const opts = options.includes("custom") ? options : [...options, "custom" as PeriodValue];
  const triggerH = compact ? "h-7 w-[130px] text-xs" : "h-9 w-[160px]";
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {showLabel && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Filter className={compact ? "h-3 w-3" : "h-4 w-4"} />
          {!compact && <span className="text-xs font-mono uppercase tracking-widest">Período</span>}
        </div>
      )}
      <Select value={value} onValueChange={(v) => onChange(v as PeriodValue)}>
        <SelectTrigger className={triggerH}><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((o) => <SelectItem key={o} value={o}>{LABELS[o] ?? o}</SelectItem>)}
        </SelectContent>
      </Select>

      {value === "custom" && onCustomChange && (
        <div className="flex items-center gap-2">
          <DatePopover
            label="Início"
            date={custom?.from}
            onSelect={(d) => onCustomChange({ ...custom, from: d })}
            compact={compact}
          />
          <span className="text-xs text-muted-foreground">→</span>
          <DatePopover
            label="Fim"
            date={custom?.to}
            onSelect={(d) => onCustomChange({ ...custom, to: d })}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}

function DatePopover({
  label, date, onSelect, compact,
}: { label: string; date?: Date; onSelect: (d?: Date) => void; compact?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal gap-1.5",
            compact ? "h-7 text-xs px-2" : "h-9 text-sm",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {date ? format(date, "dd/MM/yy", { locale: ptBR }) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
          locale={ptBR}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

export function resolvePeriod(value: PeriodValue, custom?: CustomRange): { from: Date | null; to: Date } {
  const to = new Date();
  if (value === "custom") {
    return { from: custom?.from ?? null, to: custom?.to ?? to };
  }
  if (value === "all") return { from: null, to };
  const from = new Date();
  switch (value) {
    case "today": from.setHours(0, 0, 0, 0); break;
    case "7d": from.setDate(from.getDate() - 7); break;
    case "30d": from.setDate(from.getDate() - 30); break;
    case "90d":
    case "3m": from.setDate(from.getDate() - 90); break;
    case "6m": from.setDate(from.getDate() - 180); break;
    case "month": from.setDate(1); from.setHours(0, 0, 0, 0); break;
    case "year": from.setMonth(0, 1); from.setHours(0, 0, 0, 0); break;
    case "1y": from.setDate(from.getDate() - 365); break;
  }
  return { from, to };
}