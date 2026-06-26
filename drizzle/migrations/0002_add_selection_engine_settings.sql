CREATE TABLE IF NOT EXISTS public.selection_engine_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_engine_settings_active_updated
  ON public.selection_engine_settings (active, updated_at DESC);
