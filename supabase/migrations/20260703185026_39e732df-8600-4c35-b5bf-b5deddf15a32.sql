-- 1. Função para vincular assinaturas órfãs
CREATE OR REPLACE FUNCTION public.link_orphan_subscription(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF _user_id IS NULL OR _email IS NULL OR _email = '' THEN RETURN; END IF;

  -- Loja mais recente do usuário (para preencher store_id se estiver vazio)
  SELECT id INTO v_store_id
    FROM public.stores
   WHERE owner_id = _user_id
     AND slug <> 'loja-demonstracao-phonee'
   ORDER BY created_at DESC
   LIMIT 1;

  UPDATE public.subscriptions
     SET user_id  = COALESCE(user_id, _user_id),
         store_id = COALESCE(store_id, v_store_id),
         updated_at = now()
   WHERE lower(customer_email) = lower(_email)
     AND status IN ('active','ativa','vitalicio','overdue')
     AND (user_id IS NULL OR (store_id IS NULL AND v_store_id IS NOT NULL));
END $$;

-- 2. Trigger em profiles: quando um perfil é criado, tenta vincular assinaturas do mesmo e-mail
CREATE OR REPLACE FUNCTION public.tg_link_subscription_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.link_orphan_subscription(NEW.id, NEW.email);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_link_subscription_on_profile ON public.profiles;
CREATE TRIGGER trg_link_subscription_on_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_link_subscription_on_profile();

-- 3. Trigger em stores: quando uma loja é criada, vincula assinaturas do owner
CREATE OR REPLACE FUNCTION public.tg_link_subscription_on_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = NEW.owner_id;
  IF v_email IS NOT NULL THEN
    PERFORM public.link_orphan_subscription(NEW.owner_id, v_email);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_link_subscription_on_store ON public.stores;
CREATE TRIGGER trg_link_subscription_on_store
AFTER INSERT ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.tg_link_subscription_on_store();

-- 4. Corrige o registro do Thiago (aplica a função retroativamente)
DO $$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  SELECT id, email INTO v_uid, v_email FROM public.profiles WHERE lower(email) = 'thiago0078@outlook.com';
  IF v_uid IS NOT NULL THEN
    PERFORM public.link_orphan_subscription(v_uid, v_email);
  END IF;
END $$;

-- 5. Integridade referencial: sale_items → sales com ON DELETE CASCADE
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
    FROM pg_constraint
   WHERE conrelid = 'public.sale_items'::regclass
     AND contype  = 'f'
     AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid='public.sale_items'::regclass AND attname='sale_id');
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sale_items DROP CONSTRAINT %I', v_conname);
  END IF;
  ALTER TABLE public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;
END $$;