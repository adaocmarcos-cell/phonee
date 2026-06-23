import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  store: StoreSummary | null;
  role: AppRole | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  const loadStoreAndRole = async (uid: string) => {
    // 1. Try owned store
    const storeCols = "id, name, slug, trade_name, tax_id, phone, address, email, instagram, price_table_note, logo_url, address_street, address_number, address_complement, address_neighborhood, address_city, address_uf, show_tax_id_on_docs, show_legal_name_on_docs, show_non_fiscal_notice, pdf_primary_color, pdf_accent_color, pdf_logo_url, pdf_footer_text" as any;
    const { data: owned } = await (supabase
      .from("stores") as any)
      .select(storeCols)
      .eq("owner_id", uid)
      .maybeSingle();

    let s: StoreSummary | null = owned ?? null;

    // 2. If no owned store, try linked store
    if (!s) {
      const { data: linked } = await (supabase
        .from("user_stores") as any)
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
      }
    } else {
      // Ensure link exists
      await supabase.from("user_stores").upsert({ user_id: uid, store_id: s.id });
    }

    setStore(s);

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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadStoreAndRole(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, store, role, signOut, refresh }}>
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