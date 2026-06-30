import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Ação (CTA) de um card de plano.
 * - Use `to` para renderizar um <Link> (navegação SPA).
 * - Use `onClick` para renderizar um <button>.
 */
export interface PlanCardCTA {
  id: string;
  label: ReactNode;
  ariaLabel?: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: ReactNode;
  /** Variante visual. `primary` = gradiente cheio; `outline` = secundário. */
  variant?: "primary" | "outline";
  trailingIcon?: LucideIcon;
}

export interface PlanCardActionsProps {
  /** Lista de 1..N CTAs. Renderizados empilhados no rodapé. */
  ctas: PlanCardCTA[];
  /** Linha auxiliar abaixo dos CTAs (ex: "Pagamento 100% seguro"). */
  helper?: ReactNode;
  /** Ícone do helper (default = cadeado). */
  helperIcon?: LucideIcon;
  className?: string;
}

const PRIMARY =
  "mx-auto flex w-[90%] h-12 text-base font-semibold bg-gradient-primary text-white shadow-glow hover:brightness-110 active:scale-[0.99] whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const OUTLINE =
  "mx-auto flex w-[90%] h-12 text-base font-semibold border-2 border-primary/40 bg-transparent text-primary hover:bg-primary/10 whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * Rodapé escalável dos cards de plano. Aceita 1 ou N CTAs, mantendo
 * espaçamento e largura consistentes (`mt-auto` ancora no rodapé do card flex).
 */
export function PlanCardActions({ ctas, helper, helperIcon: HelperIcon = Lock, className }: PlanCardActionsProps) {
  return (
    <div className={cn("mt-auto pt-7 space-y-3", className)} data-testid="plan-card-actions">
      {ctas.map((cta) => {
        const cls = cta.variant === "outline" ? OUTLINE : PRIMARY;
        const content = cta.loading ? cta.loadingLabel ?? cta.label : (
          <>
            {cta.label}
            {cta.trailingIcon && !cta.loading ? <cta.trailingIcon className="ml-1.5 h-4 w-4" /> : null}
          </>
        );
        if (cta.to) {
          return (
            <Button
              key={cta.id}
              asChild
              size="lg"
              className={cn(cls, "cursor-pointer")}
              disabled={cta.disabled}
            >
              <Link
                to={cta.to}
                aria-label={cta.ariaLabel}
                onClick={cta.onClick}
              >
                {content}
              </Link>
            </Button>
          );
        }
        return (
          <Button
            key={cta.id}
            size="lg"
            type="button"
            aria-label={cta.ariaLabel}
            onClick={cta.onClick}
            disabled={cta.disabled || cta.loading}
            className={cls}
          >
            {content}
          </Button>
        );
      })}
      {helper ? (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-foreground/70 text-center">
          <HelperIcon className="h-3 w-3" /> {helper}
        </div>
      ) : null}
    </div>
  );
}

export default PlanCardActions;