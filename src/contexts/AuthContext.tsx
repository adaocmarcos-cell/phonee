import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SESSION_EXPIRED_EVENT } from "@/lib/supabaseFetch";

export type AppRole = "dono" | "gerente" | "vendedor" | "estoquista";

export interface StoreSummary {
  id: string;
  name: string;
  slug: string;
  trade_name?: string | null;
  tax_id?: string | null;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  instagram?: string | null;
  price_table_note?: string | null;
  logo_url?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_uf?: string | null;
  show_tax_id_on_docs?: boolean | null;
  show_legal_name_on_docs?: boolean | null;
  show_non_fiscal_notice?: boolean | null;
  pdf_primary_color?: string | null;
  pdf_accent_color?: string | null;
  pdf_logo_url?: string | null;
  pdf_footer_text?: string | null;
}

export interface MyStore {
  store_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_owner: boolean;
  role: AppRole | null;
  subscription_status: string;
  billing_cycle: "annual" | "lifetime";
  expires_at: string | null;
  plan_name: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  store: StoreSummary | null;
  role: AppRole | null;
  stores: MyStore[];
  activeStoreSubscription: MyStore | null;
  switchStore: (storeId: string) => Promise<void>;
  reloadStores: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACTIVE_STORE_KEY = "phonee.active_store_id";
const LEGACY_ACTIVE_STORE_KEY = "mobileplus.active_store_id";
function readActiveStore(): string | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(ACTIVE_STORE_KEY);
  if (v) return v;
  const legacy = localStorage.getItem(LEGACY_ACTIVE_STORE_KEY);
  if (legacy) {
    try { localStorage.setItem(ACTIVE_STORE_KEY, legacy); localStorage.removeItem(LEGACY_ACTIVE_STORE_KEY); } catch {}
  }
  return legacy;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [stores, setStores] = useState<MyStore[]>([]);
  // Marca desconexões intencionais (clique em "Sair") para não exibir toast de
  // "Sessão expirada" nem preservar rota de retorno.
  const intentionalSignOutRef = { current: false } as { current: boolean };

  const STORE_COLS = "id, name, slug, trade_name, tax_id, phone, address, email, instagram, price_table_note, logo_url, address_street, address_number, address_complement, address_neighborhood, address_city, address_uf, show_tax_id_on_docs, show_legal_name_on_docs, show_non_fiscal_notice, pdf_primary_color, pdf_accent_color, pdf_logo_url, pdf_footer_text";

  const loadStoreById = async (storeId: string): Promise<StoreSummary | null> => {
    const { data } = await (supabase.from("stores") as any)
      .select(STORE_COLS)
      .eq("id", storeId)
      .maybeSingle();
    return (data ?? null) as StoreSummary | null;
  };

  const loadStoreAndRole = async (uid: string) => {
    // 1. Try owned store
    const storeCols = STORE_COLS as any;
    // Try previously-active store from localStorage (multi-loja)
    let s: StoreSummary | null = null;
    const savedId = readActiveStore();
    if (savedId) {
      const candidate = await loadStoreById(savedId);
      if (candidate) {
        // Validate user owns or is linked to it
        const { data: link } = await (supabase.from("user_stores") as any)
          .select("user_id").eq("user_id", uid).eq("store_id", savedId).maybeSingle();
        const { data: own } = await (supabase.from("stores") as any)
          .select("id").eq("id", savedId).eq("owner_id", uid).maybeSingle();
        if (link || own) s = candidate;
      }
    }

    if (!s) {
      const { data: owned } = await (supabase.from("stores") as any)
        .select(storeCols)
        .eq("owner_id", uid)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      s = (owned ?? null) as StoreSummary | null;
    }

    // 2. If no owned store, try linked store
    if (!s) {
      const { data: linked } = await (supabase.from("user_stores") as any)
        .select(`stores(${storeCols})`)
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle();
      s = (linked?.stores as unknown as StoreSummary | null) ?? null;
    }

    // 3. If still none, bootstrap a store + owner role for first-time signup
    if (!s) {
      const baseSlug = `loja-${uid.slice(0, 8)}`;
      const { data: created, error } = await (supabase
        .from("stores") as any)
        .insert({ name: "Minha Loja", slug: baseSlug, owner_id: uid })
        .select(storeCols)
        .single();
      if (!error && created) {
        s = created;
        await supabase.from("user_stores").insert({ user_id: uid, store_id: created.id });
        await supabase.from("user_roles").insert({ user_id: uid, store_id: created.id, role: "dono" });
        // Link any pending subscription (paid via checkout before store existed)
        try {
          await (supabase.from("subscriptions") as any)
            .update({ store_id: created.id })
            .eq("user_id", uid)
            .is("store_id", null);
        } catch {}
      }
    } else {
      // Ensure link exists
      await supabase.from("user_stores").upsert({ user_id: uid, store_id: s.id });
    }

    setStore(s);
    if (s && typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_STORE_KEY, s.id);
    }

    if (s) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("store_id", s.id)
        .order("role");
      const r = roles?.[0]?.role as AppRole | undefined;
      setRole(r ?? null);
    } else {
      setRole(null);
    }

    await loadAllStores(uid);
  };

  const loadAllStores = async (uid: string) => {
    const { data } = await (supabase.rpc as any)("my_stores", { _user_id: uid });
    setStores(((data ?? []) as MyStore[]));
  };

  const switchStore = async (storeId: string) => {
    if (!user) return;
    const next = await loadStoreById(storeId);
    if (!next) return;
    setStore(next);
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_STORE_KEY, storeId);
    const { data: roles } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", user.id).eq("store_id", storeId).order("role");
    setRole((roles?.[0]?.role as AppRole) ?? null);
    await loadAllStores(user.id);
  };

  useEffect(() => {
    // Setup listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Defer DB calls
        setTimeout(() => loadStoreAndRole(sess.user.id), 0);
      } else {
        setStore(null);
        setRole(null);
        // Se a sessão sumiu sem ter sido um logout intencional (ex.: token
        // expirado / refresh inválido), dispara o fluxo de sessão expirada.
        if (_event === "SIGNED_OUT" && !intentionalSignOutRef.current && typeof window !== "undefined") {
          const path = window.location.pathname + window.location.search;
          const shouldRedirect = !path.startsWith("/entrar") && !path.startsWith("/comprar") && !path.startsWith("/esqueci-senha") && !path.startsWith("/redefinir-senha") && path !== "/";
          if (shouldRedirect) {
            try { sessionStorage.setItem("phonee.returnTo", path); } catch {}
            toast.error("Sessão expirada. Faça login novamente.");
            window.location.assign(`/entrar?returnTo=${encodeURIComponent(path)}`);
          }
        }
        intentionalSignOutRef.current = false;
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadStoreAndRole(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Listener global do helper runQuery/loadQuery: quando qualquer chamada
  // detecta JWT expirado / 401, esse evento é disparado e nós encerramos a
  // sessão do lado do cliente para acionar o fluxo acima.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onExpired = () => {
      // signOut vai emitir SIGNED_OUT — deixamos o handler acima cuidar do
      // redirecionamento e do toast (evita mensagens duplicadas).
      intentionalSignOutRef.current = false;
      supabase.auth.signOut().catch(() => {
        // fallback bruto se por algum motivo não conseguir sair
        window.location.assign("/entrar");
      });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Realtime: quando o webhook (ou qualquer atualização) mudar a assinatura
  // do usuário logado, recarrega loja/plano imediatamente — sem exigir logout.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`sub-realtime-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => { loadStoreAndRole(user.id); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const signOut = async () => {
    intentionalSignOutRef.current = true;
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadStoreAndRole(user.id);
  };

  const reloadStores = async () => { if (user) await loadAllStores(user.id); };

  const activeStoreSubscription = store ? (stores.find((s) => s.store_id === store.id) ?? null) : null;

  return (
    <AuthContext.Provider value={{ user, session, loading, store, role, stores, activeStoreSubscription, switchStore, reloadStores, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function canSeeCost(role: AppRole | null): boolean {
  return role === "dono";
}

export function canManageProducts(role: AppRole | null): boolean {
  return role === "dono" || role === "gerente" || role === "estoquista";
}

export function canRegisterSale(role: AppRole | null): boolean {
  return role === "dono" || role === "gerente" || role === "vendedor";
}