-- ============================================================
-- ETAPA 3/3: remover a tabela legada parts_inventory.
-- Pré-validado: 0 linhas, 0 FKs apontando para ela,
-- 0 funções/views referenciando. Nenhum dado é perdido.
-- ============================================================

DO $$
DECLARE
  v_rows bigint;
  v_refs bigint;
BEGIN
  IF to_regclass('public.parts_inventory') IS NULL THEN
    RAISE NOTICE 'parts_inventory ja removida, nada a fazer';
    RETURN;
  END IF;

  -- Trava de segurança: aborta se houver qualquer linha remanescente.
  EXECUTE 'SELECT count(*) FROM public.parts_inventory' INTO v_rows;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'ABORTADO: parts_inventory ainda possui % registro(s). Migre-os para public.products antes do drop.', v_rows;
  END IF;

  -- Trava de segurança: aborta se alguma tabela ainda referenciar a legada.
  SELECT count(*) INTO v_refs
  FROM pg_constraint
  WHERE confrelid = 'public.parts_inventory'::regclass;
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % chave(s) estrangeira(s) ainda apontam para parts_inventory.', v_refs;
  END IF;

  EXECUTE 'DROP TABLE public.parts_inventory';
  RAISE NOTICE 'parts_inventory removida com seguranca';
END
$$;