import { ReactNode } from "react";
import { ChevronLeft, HelpCircle } from "lucide-react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { helpHrefForModule, helpHrefForPath } from "@/content/helpManual";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  showBack?: boolean;
  /** Se informado, mostra um "?" ao lado do título linkando para a Central de Ajuda naquele módulo. */
  helpKey?: string;
}

export function PageHeader({ title, description, actions, showBack = true, helpKey }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Hide back arrow on the main dashboard route
  const hide = pathname === "/painel" || pathname === "/painel/";
  const helpHref = helpKey ? helpHrefForModule(helpKey) : helpHrefForPath(pathname);

  return (
    <div className="mb-6">
      {showBack && !hide && (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-3 -ml-1"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          <span className="tracking-tight">Voltar</span>
        </button>
      )}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
        <div className="min-w-0">
          {title && (
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words inline-flex items-center gap-2">
              <span>{title}</span>
              <Link
                to={helpHref}
                aria-label="Ajuda deste módulo"
                title="Ajuda deste módulo"
                className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
              >
                <HelpCircle className="h-4 w-4" />
              </Link>
            </h1>
          )}
          {description && <p className="text-[13px] sm:text-sm text-muted-foreground mt-1 break-words">{description}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}