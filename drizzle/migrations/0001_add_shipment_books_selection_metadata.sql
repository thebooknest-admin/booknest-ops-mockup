ALTER TABLE public.shipment_books
  ADD COLUMN IF NOT EXISTS selection_metadata jsonb NULL;