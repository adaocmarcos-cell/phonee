-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('dono', 'gerente', 'vendedor', 'estoquista');
CREATE TYPE public.product_category AS ENUM ('acessorio', 'peca', 'aparelho_novo', 'aparelho_seminovo');
CREATE TYPE public.product_condition AS ENUM ('novo', 'seminovo', 'recondicionado');
CREATE TYPE public.product_status AS ENUM ('ativo', 'inativo', 'promocao');
CREATE TYPE public.payment_method AS ENUM ('dinheiro', 'pix', 'debito', 'credito', 'crediario');
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'danger');

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= STORES =============
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563EB',
  welcome_text TEXT,
  hours TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- ============= USER-STORE LINK =============
CREATE TABLE public.user_stores (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);
ALTER TABLE public.user_stores ENABLE ROW LEVEL SECURITY;

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, store_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============= SECURITY DEFINER FUNCTIONS =============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _store_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND store_id = _store_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.user_has_store_access(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_stores
    WHERE user_id = _user_id AND store_id = _store_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID, _store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = _store_id AND owner_id = _user_id
  )
$$;

-- Stores policies
CREATE POLICY "stores_select_member" ON public.stores
  FOR SELECT TO authenticated USING (public.user_has_store_access(auth.uid(), id) OR owner_id = auth.uid());
CREATE POLICY "stores_insert_self" ON public.stores
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "stores_update_owner" ON public.stores
  FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "stores_delete_owner" ON public.stores
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
-- Public read for catalog
CREATE POLICY "stores_public_read" ON public.stores
  FOR SELECT TO anon USING (true);

-- User-stores policies
CREATE POLICY "user_stores_select_own" ON public.user_stores
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_owner(auth.uid(), store_id));
CREATE POLICY "user_stores_owner_manage" ON public.user_stores
  FOR ALL TO authenticated USING (public.is_owner(auth.uid(), store_id))
  WITH CHECK (public.is_owner(auth.uid(), store_id));

-- User roles policies
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_owner(auth.uid(), store_id));
CREATE POLICY "user_roles_owner_manage" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_owner(auth.uid(), store_id))
  WITH CHECK (public.is_owner(auth.uid(), store_id));

-- ============= PRODUCTS =============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  ean TEXT,
  brand TEXT,
  compatible_model TEXT,
  category public.product_category NOT NULL DEFAULT 'acessorio',
  subcategory TEXT,
  condition public.product_condition NOT NULL DEFAULT 'novo',
  supplier TEXT,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_current INTEGER NOT NULL DEFAULT 0,
  stock_min INTEGER NOT NULL DEFAULT 0,
  stock_max INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  photos TEXT[] DEFAULT '{}',
  visible_in_catalog BOOLEAN NOT NULL DEFAULT false,
  status public.product_status NOT NULL DEFAULT 'ativo',
  last_sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_products_store ON public.products(store_id);
CREATE INDEX idx_products_status ON public.products(status);

CREATE POLICY "products_select_member" ON public.products
  FOR SELECT TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "products_insert_member" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "products_update_member" ON public.products
  FOR UPDATE TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "products_delete_owner_manager" ON public.products
  FOR DELETE TO authenticated USING (
    public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente')
  );
-- Public catalog
CREATE POLICY "products_public_catalog" ON public.products
  FOR SELECT TO anon USING (visible_in_catalog = true AND status <> 'inativo');

-- ============= SALES =============
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  seller_id UUID REFERENCES auth.users(id),
  customer_name TEXT,
  customer_doc TEXT,
  payment_method public.payment_method NOT NULL,
  installments INTEGER DEFAULT 1,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total NUMERIC(10,2) NOT NULL
);
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sales_store ON public.sales(store_id);
CREATE INDEX idx_sales_created ON public.sales(created_at DESC);

CREATE POLICY "sales_select_member" ON public.sales
  FOR SELECT TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "sales_insert_member" ON public.sales
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "sales_update_owner" ON public.sales
  FOR UPDATE TO authenticated USING (public.is_owner(auth.uid(), store_id));
CREATE POLICY "sales_delete_owner" ON public.sales
  FOR DELETE TO authenticated USING (public.is_owner(auth.uid(), store_id));

CREATE POLICY "sale_items_select_member" ON public.sale_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.user_has_store_access(auth.uid(), s.store_id))
  );
CREATE POLICY "sale_items_insert_member" ON public.sale_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.user_has_store_access(auth.uid(), s.store_id))
  );

-- ============= ALERTS =============
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity public.alert_severity NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_alerts_store ON public.alerts(store_id, is_read);

CREATE POLICY "alerts_select_member" ON public.alerts
  FOR SELECT TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "alerts_insert_member" ON public.alerts
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "alerts_update_member" ON public.alerts
  FOR UPDATE TO authenticated USING (public.user_has_store_access(auth.uid(), store_id));

-- ============= AUDIT LOG =============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_owner" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_owner(auth.uid(), store_id));
CREATE POLICY "audit_insert_member" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.user_has_store_access(auth.uid(), store_id));

-- ============= updated_at trigger =============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();