
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#2563EB',
  icon TEXT DEFAULT 'Receipt',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_categories_store ON public.expense_categories(store_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read system or store categories" ON public.expense_categories FOR SELECT TO authenticated
  USING (is_system = true OR public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "Managers manage store categories" ON public.expense_categories FOR ALL TO authenticated
  USING (store_id IS NOT NULL AND (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)))
  WITH CHECK (store_id IS NOT NULL AND (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role)));

CREATE TRIGGER expense_categories_updated_at BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  subcategory TEXT,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL,
  cost_center TEXT,
  notes TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_store_date ON public.expenses(store_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON public.expenses(category_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read expenses" ON public.expenses FOR SELECT TO authenticated
  USING (public.user_has_store_access(auth.uid(), store_id));
CREATE POLICY "Members create expenses" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store_access(auth.uid(), store_id) AND created_by = auth.uid());
CREATE POLICY "Members update own or managers all" ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role) OR created_by = auth.uid());
CREATE POLICY "Managers delete expenses" ON public.expenses FOR DELETE TO authenticated
  USING (public.is_owner(auth.uid(), store_id) OR public.has_role(auth.uid(), store_id, 'gerente'::app_role));

CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.expense_categories (name, is_system, icon, color) VALUES
  ('Aluguel', true, 'Home', '#2563EB'),
  ('Condomínio', true, 'Building2', '#2563EB'),
  ('IPTU', true, 'Landmark', '#F59E0B'),
  ('Energia Elétrica', true, 'Zap', '#F59E0B'),
  ('Água e Esgoto', true, 'Droplets', '#06B6D4'),
  ('Internet', true, 'Wifi', '#10B981'),
  ('Telefonia', true, 'Phone', '#10B981'),
  ('Salários', true, 'Users', '#8B5CF6'),
  ('Pró-labore', true, 'UserCog', '#8B5CF6'),
  ('Comissões', true, 'Percent', '#8B5CF6'),
  ('Marketing', true, 'Megaphone', '#EF4444'),
  ('Meta Ads', true, 'Facebook', '#1877F2'),
  ('Google Ads', true, 'Search', '#EA4335'),
  ('Estoque', true, 'Boxes', '#2563EB'),
  ('Compra de Mercadorias', true, 'ShoppingCart', '#2563EB'),
  ('Fretes', true, 'Truck', '#F59E0B'),
  ('Embalagens', true, 'Package', '#10B981'),
  ('Combustível', true, 'Fuel', '#EF4444'),
  ('Manutenção', true, 'Wrench', '#6B7280'),
  ('Seguros', true, 'Shield', '#10B981'),
  ('Impostos', true, 'FileText', '#EF4444'),
  ('Taxas Bancárias', true, 'Banknote', '#EF4444'),
  ('Cartão de Crédito', true, 'CreditCard', '#2563EB'),
  ('Sistemas e Softwares', true, 'Monitor', '#8B5CF6'),
  ('Hospedagem de Site', true, 'Server', '#8B5CF6'),
  ('Domínio', true, 'Globe', '#8B5CF6'),
  ('Material de Escritório', true, 'Pencil', '#6B7280'),
  ('Limpeza', true, 'Sparkles', '#06B6D4'),
  ('Outros', true, 'MoreHorizontal', '#6B7280');
