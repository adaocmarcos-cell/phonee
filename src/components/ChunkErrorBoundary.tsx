import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

const RELOAD_KEY = "phonee_chunk_reload_at";

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as any)?.message ?? String(error);
  const name = (error as any)?.name ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

function tryReloadOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    // Only reload once per 30s to avoid infinite loops
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    if (isChunkLoadError(error)) {
      // Attempt a one-time reload to fetch fresh chunks after deploy.
      if (tryReloadOnce()) return { hasError: false };
    }
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("[ChunkErrorBoundary]", error);
  }

  handleRetry = () => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-xl font-semibold text-foreground">Algo deu errado ao carregar a página</h1>
            <p className="text-sm text-muted-foreground">
              Uma nova versão do sistema pode ter sido publicada. Recarregue para continuar.
            </p>
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground h-10 px-4 text-sm font-medium hover:bg-primary/90"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ChunkErrorBoundary;