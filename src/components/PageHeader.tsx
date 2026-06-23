import { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
  showBack?: boolean;
}

export function PageHeader({ title, description, actions, showBack = true }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Hide back arrow on the main dashboard route
  const hide = pathname === "/painel" || pathname === "/painel/";

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
          {title && <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">{title}</h1>}
          {description && <p className="text-[13px] sm:text-sm text-muted-foreground mt-1 break-words">{description}</p>}
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}