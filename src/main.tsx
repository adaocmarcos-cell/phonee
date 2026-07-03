import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initPreferences } from "./lib/preferences";

initPreferences();

// Recover from stale lazy-chunk failures after a new deploy: if a dynamic
// import fails at runtime (old index.html referencing hashed chunks that no
// longer exist), reload once so the browser fetches the fresh bundle.
const CHUNK_RELOAD_KEY = "phonee_chunk_reload_at";
function isChunkLoadError(err: unknown): boolean {
  const msg = (err as any)?.message ?? String(err ?? "");
  const name = (err as any)?.name ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}
function maybeReload(err: unknown) {
  if (!isChunkLoadError(err)) return;
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
  } catch {}
}
window.addEventListener("error", (e) => maybeReload(e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => maybeReload(e.reason));

createRoot(document.getElementById("root")!).render(<App />);
