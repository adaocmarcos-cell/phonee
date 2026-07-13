import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type PermModule = "vendas" | "compras" | "financeiro" | "estoque" | "clientes" | (string & {});
type PermAction = "excluir" | "criar" | "editar" | "visualizar" | (string & {});

// Cache em memória por (user, store, module, action). Evita re-consulta a cada render.
const cache = new Map<string, boolean>();
const inflight = new Map<string, Promise<boolean>>();

function keyOf(u: string, s: string, m: string, a: string) {
  return `${u}::${s}::${m}::${a}`;
}

async function fetchPermission(userId: string, storeId: string, module: string, action: string) {
  const k = keyOf(userId, storeId, module, action);
  if (cache.has(k)) return cache.get(k)!;
  if (inflight.has(k)) return inflight.get(k)!;
  const p = (async () => {
    const { data, error } = await supabase.rpc("has_permission", {
      _user_id: userId,
      _store_id: storeId,
      _module: module,
      _action: action,
    });
    const allowed = !error && data === true;
    cache.set(k, allowed);
    inflight.delete(k);
    return allowed;
  })();
  inflight.set(k, p);
  return p;
}

/**
 * Consulta a matriz de permissões do dono (public.has_permission).
 * Retorna { allowed, loading }. Dono e admin master sempre recebem `true`.
 */
export function useHasPermission(module: PermModule, action: PermAction, storeIdOverride?: string | null) {
  const { user, store, role } = useAuth();
  const storeId = storeIdOverride ?? store?.id ?? null;
  const isSuper = role === "dono" || (role as string) === "admin_master";
  const [allowed, setAllowed] = useState<boolean>(isSuper);
  const [loading, setLoading] = useState<boolean>(!isSuper && !!(user?.id && storeId));

  useEffect(() => {
    let cancelled = false;
    if (isSuper) {
      setAllowed(true);
      setLoading(false);
      return;
    }
    if (!user?.id || !storeId) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPermission(user.id, storeId, module, action).then((ok) => {
      if (!cancelled) {
        setAllowed(ok);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user?.id, storeId, module, action, isSuper]);

  return { allowed, loading };
}

/** Invalida o cache — chame após alterar `role_permissions`. */
export function clearPermissionCache() {
  cache.clear();
  inflight.clear();
}