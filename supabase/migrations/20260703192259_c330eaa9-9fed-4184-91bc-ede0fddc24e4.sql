CREATE UNIQUE INDEX IF NOT EXISTS customers_store_document_uidx
  ON public.customers (store_id, document)
  WHERE document IS NOT NULL AND document <> '';